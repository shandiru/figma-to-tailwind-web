import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeClipboard } from '../src/services/clipboardDecoder.js';
import { clipboardLayers, pathFromBlob } from '../src/services/clipboardLayers.js';
import { nativeClipboardHtml, sampleMessage } from './helpers/nativeClipboard.js';
import app from '../src/app.js';
import { demoDesign } from '../../frontend/src/data/demo.js';
import { createHash } from 'node:crypto';

test('resolves embedded image bytes referenced by hash instead of a blob index', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0J8AAAAASUVORK5CYII=', 'base64');
  const scene = sampleMessage();
  scene.blobs = [{ bytes: png }];
  scene.nodeChanges[1].fillPaints = [{ type: 'IMAGE', image: { hash: createHash('sha1').update(png).digest() } }];
  const design = clipboardLayers(scene);
  assert.equal(design.assets[design.frame.children[0].backgroundImage.assetId], png.toString('base64'));
  assert.deepEqual(design.issues, []);
});

test('uses embedded glyph outlines for icon fonts while ordinary text stays editable', () => {
  const scene = sampleMessage();
  const path = Buffer.alloc(19);
  path[0] = 1; path.writeFloatLE(0, 1); path.writeFloatLE(0, 5);
  path[9] = 2; path.writeFloatLE(0.5, 10); path.writeFloatLE(1, 14); path[18] = 0;
  scene.blobs = [{ bytes: path }];
  const icon = scene.nodeChanges[2];
  icon.fontName.family = 'FontAwesome';
  icon.textData.characters = '\uf101';
  icon.textData.glyphs = [{ commandsBlob: 0, position: { x: 0, y: 20 }, fontSize: 20 }];
  const design = clipboardLayers(scene);
  const layer = design.frame.children[0].children[0];
  assert.equal(layer.type, 'VECTOR');
  assert.equal(layer.text, undefined);
  assert.match(Buffer.from(design.assets[layer.asset.assetId], 'base64').toString(), /scale\(20 -20\)/);
  assert.deepEqual(design.issues, []);
});

test('decodes escaped clipboard HTML and payloads with stripped comment wrappers', () => {
  const html = nativeClipboardHtml();
  for (const value of [html.replaceAll('<', '&lt;').replaceAll('>', '&gt;'), html.replaceAll('<!--', '').replaceAll('-->', '')]) {
    assert.equal(clipboardLayers(decodeClipboard(value)).frame.name, 'Landing page');
  }
});

for (const compression of ['deflate', 'zstd']) test(`decodes native clipboard ${compression} scenes and preserves text, hierarchy and styled runs`, () => {
  const message = decodeClipboard(nativeClipboardHtml(sampleMessage(), compression));
  const design = clipboardLayers(message);
  assert.equal(design.frame.name, 'Landing page');
  assert.equal(design.frame.x, 0);
  assert.equal(design.frame.transform, undefined);
  const hero = design.frame.children[0];
  assert.equal(hero.name, 'Hero section');
  assert.equal(hero.y, 100);
  assert.equal(hero.children[0].text, 'Hello world');
  assert.equal(hero.children[0].segments[1].css['font-weight'], '700');
  assert.equal(design.frame.children[1].name, 'Footer');
});

test('rejects incomplete clipboard bytes and plain links without executing pasted markup', () => {
  assert.throws(() => decodeClipboard('<script>throw new Error("ran")</script>https://figma.com/file/abc'), /No editable Figma data/);
  const html = nativeClipboardHtml().replace(/(<!--\(figma\))([A-Za-z0-9+/=]+)(\(\/figma\)-->)/, (_match, start, data, end) => `${start}${data.slice(0, -24)}${end}`);
  assert.throws(() => decodeClipboard(html), /Incomplete|format/);
});

test('retains embedded image blobs and reports artwork omitted from the clipboard', () => {
  const scene = sampleMessage();
  scene.blobBaseIndex = 10;
  scene.blobs = [{ bytes: new Uint8Array([1, 2, 3]) }];
  scene.nodeChanges[1].fillPaints = [{ type: 'IMAGE', image: { dataBlob: 10 } }];
  scene.nodeChanges[3].fillPaints = [{ type: 'IMAGE', image: { hash: [1, 2] } }];
  const result = clipboardLayers(scene);
  const ref = result.frame.children[0].backgroundImage.assetId;
  assert.equal(result.assets[ref], 'AQID');
  assert.match(result.warnings[0], /No original image.*Footer/);
  assert.equal(result.issues[0].kind, 'image');
  assert.equal(result.frame.children[1].importIssues[0].name, 'Footer');
});

test('decodes vector geometry and rejects malformed command streams', () => {
  const bytes = Buffer.alloc(19);
  bytes[0] = 1; bytes.writeFloatLE(2, 1); bytes.writeFloatLE(3, 5);
  bytes[9] = 2; bytes.writeFloatLE(8, 10); bytes.writeFloatLE(9, 14); bytes[18] = 0;
  assert.equal(pathFromBlob(bytes), 'M2 3 L8 9 Z');
  assert.throws(() => pathFromBlob(Buffer.from([4, 1])), /Unsupported/);
});

test('authenticated JSON preview prepares a selectable canvas and rejects clipboard payloads', async t => {
  const { authorize } = await import('./helpers/auth.js');
  const fetch = authorize(t);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api/layers/preview`;
  const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layers: JSON.stringify(demoDesign()) }) });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.design.frame.name, demoDesign().frame.name);
  assert.match(result.preview, /Good things/);
  const pluginDesign = demoDesign();
  delete pluginDesign.warnings;
  pluginDesign.frame.children.push({ name: 'Pattern stripes / Vector', type: 'VECTOR', x: 0, y: 0, width: 0.01, height: 20, asset: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="20" viewBox="0 0 0.01 20"><rect width="0.01" height="20" fill="red"/></svg>').toString('base64') });
  const plugin = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layers: JSON.stringify(pluginDesign) }) });
  assert.equal(plugin.status, 200, await plugin.clone().text());
  const pastedPlugin = await plugin.json();
  assert.equal(pastedPlugin.design.frame.name, demoDesign().frame.name);
  assert.match(pastedPlugin.preview, /Good things/);
  assert.match(pastedPlugin.preview, /data:image\/webp;base64,/);
  assert.ok(pastedPlugin.warnings.some(warning => /raster dimensions were repaired/.test(warning)));
  const invalid = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html: '<span>not a frame</span>' }) });
  assert.equal(invalid.status, 400);
  const removed = await fetch(`http://127.0.0.1:${server.address().port}/api/clipboard`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(removed.status, 404);
});


const componentGuid = localID => ({ sessionID: 9, localID });
const componentNode = (id, parent, type, name, width = 200, height = 50) => ({ guid: componentGuid(id), ...(parent ? { parentIndex: { guid: componentGuid(parent), position: String(id) } } : {}), type, name, size: { x: width, y: height }, transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 } });

test('native copy expands repeated component references with independent text and derived geometry', () => {
  const frame = componentNode(1, null, 'FRAME', 'Copied page', 1200, 800);
  const symbol = componentNode(2, null, 'SYMBOL', 'Button definition');
  const text = { ...componentNode(3, 2, 'TEXT', 'Label'), overrideKey: componentGuid(99), textData: { characters: 'Default label' } };
  const instance = id => ({ ...componentNode(id, 1, 'INSTANCE', `Button ${id}`), symbolData: { symbolID: symbol.guid, symbolOverrides: [{ guidPath: { guids: [text.overrideKey] }, textData: { characters: `Label ${id}` } }] }, derivedSymbolData: [{ guidPath: { guids: [text.overrideKey] }, size: { x: 180, y: 30 }, transform: { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 8 } }] });
  const message = { nodeChanges: [frame, symbol, text, instance(4), instance(5)], blobs: [] };
  const design = clipboardLayers(decodeClipboard(nativeClipboardHtml(message)));
  assert.equal(design.frame.name, 'Copied page', 'component dependencies do not appear as extra page roots');
  assert.deepEqual(design.frame.children.map(node => node.children[0].text), ['Label 4', 'Label 5']);
  assert.equal(design.frame.children[0].children[0].x, 10);
  assert.equal(design.frame.children[0].children[0].width, 180);
  assert.notEqual(design.frame.children[0].children[0].id, design.frame.children[1].children[0].id);
  assert.deepEqual(design.issues, []);
  assert.equal(text.textData.characters, 'Default label', 'definition is never mutated by instance overrides');
});

test('nested component overrides use the instance identity path and prefer outer resolved geometry', () => {
  const frame = componentNode(1, null, 'FRAME', 'Page', 1200, 800);
  const outer = componentNode(2, null, 'SYMBOL', 'Card');
  const inner = componentNode(3, null, 'SYMBOL', 'Label component');
  const nested = { ...componentNode(4, 2, 'INSTANCE', 'Nested label'), symbolData: { symbolID: inner.guid } };
  const text = { ...componentNode(5, 3, 'TEXT', 'Text'), textData: { characters: 'Default' } };
  const instance = { ...componentNode(6, 1, 'INSTANCE', 'Card instance'), symbolData: { symbolID: outer.guid, symbolOverrides: [{ guidPath: { guids: [nested.guid, text.guid] }, textData: { characters: 'Nested override' } }] } };
  const design = clipboardLayers({ nodeChanges: [frame, outer, inner, nested, text, instance], blobs: [] });
  assert.equal(design.frame.children[0].children[0].children[0].text, 'Nested override');
  assert.deepEqual(design.issues, []);
  nested.symbolData.symbolID = outer.guid;
  assert.throws(() => clipboardLayers({ nodeChanges: [frame, outer, inner, nested, text, instance], blobs: [] }), /component hierarchy/);
});

test('uses an embedded image thumbnail when the original bytes are absent and reports reduced resolution', () => {
  const scene = sampleMessage();
  scene.blobs = [{ bytes: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) }];
  scene.nodeChanges[1].fillPaints = [{ type: 'IMAGE', image: {}, imageThumbnail: { dataBlob: 0 } }];
  const design = clipboardLayers(decodeClipboard(nativeClipboardHtml(scene)));
  assert.ok(design.frame.children[0].backgroundImage);
  assert.equal(design.issues[0].kind, 'image-resolution');
  assert.match(design.issues[0].message, /thumbnail/);
});
