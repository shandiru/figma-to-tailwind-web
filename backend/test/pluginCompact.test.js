import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { prepareInput } from '../src/services/inputService.js';
import { convertDesign } from '../src/services/conversionService.js';

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 12L10 20L22 2" fill="none" stroke="red" stroke-width="2"/></svg>');

async function exportNodes(children) {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const frame = { name: 'Icons', type: 'FRAME', width: 300, height: 200, children };
  const figma = { currentPage: { selection: [frame] }, showUI() {}, base64Encode: bytes => Buffer.from(bytes).toString('base64'), ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export', rasterArtwork: true, preferSvg: true });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  return { result, design: JSON.parse(result.json) };
}

test('SVG icons stay vector, zero-height strokes survive, and blank SVG falls back to PNG', async () => {
  const formats = [];
  const icon = { name: 'Thin icon', type: 'LINE', width: 24, height: 0, strokeWeight: 2, absoluteRenderBounds: { width: 24, height: 0 }, exportAsync: async settings => { formats.push(settings.format); return svg; } };
  const blank = { name: 'Imported icon', type: 'VECTOR', width: 24, height: 24, exportAsync: async settings => {
    formats.push(settings.format);
    return settings.format === 'SVG' ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') : Buffer.from([137, 80, 78, 71]);
  } };
  const { design } = await exportNodes([icon, blank]);
  assert.deepEqual(formats, ['SVG', 'SVG', 'PNG']);
  assert.equal(design.frame.children[0].height, 2);
  assert.equal(design.assets[design.frame.children[0].asset.assetId], svg.toString('base64'));
  assert.equal(design.assets[design.frame.children[1].asset.assetId], 'iVBORw==');
});

test('mixed-font icon glyphs render as artwork through JSON import and HTML conversion', async () => {
  const icon = { name: 'Icon glyph', type: 'TEXT', width: 24, height: 24, characters: '\ue001', fontName: Symbol('mixed'), exportAsync: async settings => {
    assert.equal(settings.format, 'SVG'); assert.equal(settings.svgOutlineText, true); return svg;
  } };
  const regular = { name: 'Label', type: 'TEXT', width: 100, height: 24, characters: 'Editable label', getStyledTextSegments: () => [{ characters: 'Editable label' }] };
  const { result } = await exportNodes([icon, regular]);
  const input = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(result.json) }, 'desktop');
  const output = await convertDesign(input, null, {});
  assert.match(output.html, /<img data-layer="Icon glyph"/);
  assert.match(output.html, /Editable label/);
  assert.equal(output.files.length, 1);
  assert.equal(input.design.frame.children[1].asset, undefined);
  assert.ok(!result.json.includes('resolvedCss'), 'Merged concrete styles are serialized once');
});

test('failed isolation cleans up temporary nodes and recovers direct SVG artwork', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  let stageRemoved = false, cloneRemoved = false;
  const messages = [];
  const icon = { name: 'Clone recovery', type: 'VECTOR', width: 24, height: 24, clone: () => ({ remove() { cloneRemoved = true; }, absoluteRenderBounds: null }), exportAsync: async () => svg };
  const figma = { currentPage: { selection: [{ name: 'Frame', type: 'FRAME', width: 300, height: 200, children: [icon] }] }, showUI() {}, base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    createFrame: () => ({ resize() {}, appendChild() {}, remove() { stageRemoved = true; } }), ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export', rasterArtwork: true, preferSvg: true });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  assert.equal(stageRemoved, true); assert.equal(cloneRemoved, true);
  assert.ok(JSON.parse(result.json).frame.children[0].asset);
});

test('small JSON exports are gzip packed losslessly and reference images remain optional', async () => {
  const html = await readFile(new URL('../../figma-plugin/ui.html', import.meta.url), 'utf8');
  const elements = Object.fromEntries(['version', 'status', 'data', 'export', 'copy', 'download', 'reference'].map(id => [id, { disabled: false, checked: false }]));
  const posted = [];
  const context = vm.createContext({ Blob, Response, CompressionStream, Uint8Array, btoa, document: { getElementById: id => elements[id] }, parent: { postMessage: message => posted.push(message) } });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  elements.export.onclick();
  assert.equal(posted.at(-1).pluginMessage.includeReference, false);
  elements.reference.checked = true; elements.export.onclick();
  assert.equal(posted.at(-1).pluginMessage.includeReference, true);
  const json = JSON.stringify({ format: 'figma-to-tailwind', version: 1, frame: { name: 'Small', text: 'Editable text '.repeat(4000) } });
  const packed = await context.prepareExport({ json, name: 'Small', count: 1 });
  assert.ok(packed.length < json.length / 10);
  const data = JSON.parse(packed);
  assert.equal(gunzipSync(Buffer.from(data.data, 'base64')).toString(), json);
});

test('optional raster compression keeps SVGs untouched and falls back when WebP is unsupported', async () => {
  const html = await readFile(new URL('../../figma-plugin/ui.html', import.meta.url), 'utf8');
  const elements = Object.fromEntries(['status', 'data', 'export', 'copy', 'download', 'compressRaster'].map(id => [id, { checked: id === 'compressRaster' }]));
  const source = 'iVBORw0KGgo' + 'A'.repeat(70000);
  let closed = 0;
  let supported = true;
  const context = vm.createContext({ Blob, Uint8Array, btoa, atob, createImageBitmap: async () => ({ width: 400, height: 300, close() { closed++; } }),
    document: { getElementById: id => elements[id], createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: (callback, type, quality) => {
      assert.equal(type, 'image/webp'); assert.equal(quality, 0.94);
      callback(new Blob(['smaller-image'], { type: supported ? 'image/webp' : 'image/png' }));
    } }) }, parent: { postMessage() {} } });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  const design = { assets: { photo: source, icon: svg.toString('base64') }, frame: { name: 'Test' } };
  let packed = JSON.parse(await context.prepareExport({ json: JSON.stringify(design) }));
  assert.equal(packed.assets.photo, Buffer.from('smaller-image').toString('base64'));
  assert.equal(packed.assets.icon, design.assets.icon);
  supported = false;
  packed = JSON.parse(await context.prepareExport({ json: JSON.stringify(design) }));
  assert.equal(packed.assets.photo, source);
  assert.equal(closed, 2);
});
