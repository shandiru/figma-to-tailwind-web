import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('plugin exports live text and containers while limiting artwork exports to leaves', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const transform = [[1, 0, 0], [0, 1, 0]];
  const text = {
    name: 'Headline', type: 'TEXT', width: 200, height: 30, relativeTransform: transform,
    visible: true, characters: 'Editable heading', textAlignVertical: 'TOP',
    getCSSAsync: async () => ({ color: '#123456' }),
    getStyledTextSegments: () => [{ characters: 'Editable heading', fontName: { family: 'Inter', style: 'Bold' }, fontSize: 20, fontWeight: 700, fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }], lineHeight: { unit: 'PIXELS', value: 25 }, letterSpacing: { unit: 'PIXELS', value: 0 }, textDecoration: 'NONE', textCase: 'ORIGINAL' }],
    exportAsync: () => assert.fail('Text must remain editable, never exported as artwork'),
  };
  const frame = {
    name: 'Frame', type: 'FRAME', width: 300, height: 200, visible: true, children: [text],
    getCSSAsync: async () => ({ background: '#ffffff' }),
    exportAsync: () => assert.fail('The root frame must never become an image'),
  };
  const figma = { currentPage: { selection: [frame] }, showUI: () => {}, ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  const design = JSON.parse(result.json);
  assert.equal(design.frame.children[0].text, 'Editable heading');
  assert.equal(design.frame.children[0].segments[0].css['font-weight'], '700');
  assert.deepEqual(design.fonts, ['Inter']);
  figma.currentPage.selection = [];
  await figma.ui.onmessage({ type: 'export' });
  assert.equal(messages.at(-1).type, 'error');
});

test('CSS export failures fall back to editable basic styles', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const frame = {
    name: 'Fallback frame', type: 'FRAME', width: 300, height: 200, visible: true, children: [],
    fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }], cornerRadius: 12,
    getCSSAsync: async () => { throw new Error('CSS unavailable'); },
  };
  const figma = { currentPage: { selection: [frame] }, showUI: () => {}, ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  const design = JSON.parse(result.json);
  assert.equal(design.frame.css.background, 'rgba(255,0,0,1)');
  assert.match(design.warnings[0], /CSS unavailable/);
});

test('export failures identify the layer and notify outside the plugin panel', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const notifications = [];
  const frame = {
    name: 'Main frame', type: 'FRAME', width: 300, height: 200, visible: true,
    children: [{ name: 'Broken text', type: 'TEXT', width: 100, height: 20, characters: 'Example', getStyledTextSegments: () => { throw new Error('Text unavailable'); } }],
  };
  const figma = { currentPage: { selection: [frame] }, showUI: () => {}, notify: message => notifications.push(message), ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  assert.match(messages.at(-1).message, /Broken text.*Text unavailable/);
  assert.match(notifications[0], /Broken text/);
});

test('plugin UI keeps status above controls and progress does not re-enable copy', async () => {
  const html = await readFile(new URL('../../figma-plugin/ui.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="status"') < html.indexOf('id="export"'));
  const elements = Object.fromEntries(['status', 'data', 'export', 'copy', 'download'].map(id => [id, { disabled: id !== 'export', value: '', className: '' }]));
  const posted = [];
  const context = vm.createContext({ document: { getElementById: id => elements[id] }, parent: { postMessage: message => posted.push(message) } });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  elements.export.onclick();
  assert.equal(posted[0].pluginMessage.type, 'ready');
  assert.equal(posted.at(-1).pluginMessage.type, 'export');
  context.onmessage({ data: { pluginMessage: { type: 'progress', count: 15, name: 'Artwork' } } });
  assert.equal(elements.export.disabled, true);
  assert.equal(elements.copy.disabled, true);
  assert.match(elements.status.textContent, /Artwork/);
  context.onmessage({ data: { pluginMessage: { type: 'error', message: 'Layer failed' } } });
  assert.equal(elements.export.disabled, false);
  assert.equal(elements.status.className, 'error');
  assert.equal(elements.status.textContent, 'Layer failed');
});

test('empty vectors do not prevent the rest of the frame from exporting', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const transform = [[1, 0, 0], [0, 1, 0]];
  const frame = { name: 'Main frame', type: 'FRAME', width: 300, height: 200, children: [] };
  const leaf = name => ({ name, type: 'VECTOR', width: 20, height: 20, relativeTransform: transform, absoluteTransform: transform, parent: frame });
  frame.children = [
    { ...leaf('Empty Vector'), exportAsync: async () => { throw new Error('Failed to export node. This node may not have any visible layers.'); } },
    { ...leaf('Visible icon'), exportAsync: async () => new Uint8Array([1, 2, 3]) },
  ];
  const figma = {
    currentPage: { selection: [frame] }, showUI: () => {},
    base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    ui: { postMessage: message => messages.push(message) },
  };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  const design = JSON.parse(result.json);
  assert.equal(design.frame.children.length, 1);
  assert.equal(design.frame.children[0].name, 'Visible icon');
  assert.equal(design.assets[design.frame.children[0].asset.assetId], 'AQID');
  assert.match(design.warnings[0], /Empty Vector.*no visible content/);

  frame.children[0].exportAsync = async () => { throw new Error('Permission denied'); };
  await figma.ui.onmessage({ type: 'export' });
  assert.equal(messages.at(-1).type, 'error');
  assert.match(messages.at(-1).message, /Empty Vector.*Permission denied/);
});

test('handles Figma string rejections and attempts export before discarding null render bounds', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const transform = [[1, 0, 0], [0, 1, 0]];
  const frame = { name: 'Main frame', type: 'FRAME', width: 300, height: 200, children: [] };
  const leaf = name => ({ name, type: 'VECTOR', width: 20, height: 20, relativeTransform: transform, absoluteTransform: transform, parent: frame });
  frame.children = [
    { ...leaf('String rejection'), exportAsync: async () => { throw 'Failed to export node. This node may not have any visible layers.'; } },
    { ...leaf('Null bounds'), absoluteRenderBounds: null, exportAsync: async () => new Uint8Array([4, 5, 6]) },
    { ...leaf('Zero bounds'), absoluteRenderBounds: { width: 0, height: 20 }, exportAsync: () => assert.fail('No artwork to export') },
    { ...leaf('Visible icon'), exportAsync: async () => new Uint8Array([1, 2, 3]) },
  ];
  const figma = {
    currentPage: { selection: [frame] }, showUI: () => {},
    base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    ui: { postMessage: message => messages.push(message) },
  };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'ready' });
  assert.equal(messages[0].version, '1.5');
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  assert.equal(result.exporterVersion, '1.5');
  const design = JSON.parse(result.json);
  assert.equal(design.frame.children.length, 2);
  assert.equal(design.frame.children[0].name, 'Null bounds');
  assert.equal(design.frame.children[1].name, 'Visible icon');
  assert.equal(design.warnings.length, 2);
});

test('exports masked artwork as a composite and recovers logos via PNG without flattening regular text', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const exports = [];
  const transform = [[1, 0, 0], [0, 1, 0]];
  const frame = { name: 'Page', type: 'FRAME', width: 600, height: 400, children: [] };
  frame.children.push({ name: 'Masked logo', type: 'GROUP', width: 100, height: 50, relativeTransform: transform, children: [
    { name: 'mask', isMask: true, type: 'VECTOR', exportAsync: () => assert.fail('Composite mask must stay together') },
    { name: 'artwork', type: 'VECTOR', exportAsync: () => assert.fail('Composite artwork must stay together') },
  ], exportAsync: async settings => { exports.push(settings); return new Uint8Array([1, 2, 3]); } });
  frame.children.push({ name: 'Recoverable logo', type: 'VECTOR', width: 80, height: 30, absoluteRenderBounds: null, exportAsync: async settings => {
    exports.push(settings);
    if (settings.format === 'SVG') throw new Error('This node may not have any visible layers');
    return new Uint8Array([4, 5, 6]);
  } });
  const figma = { currentPage: { selection: [frame] }, showUI: () => {}, base64Encode: bytes => Buffer.from(bytes).toString('base64'), ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  const data = JSON.parse(result.json);
  assert.equal(data.frame.children.length, 2);
  assert.ok(data.frame.children.every(child => child.asset && !child.children));
  assert.equal(exports[0].svgOutlineText, true);
  assert.equal(exports.at(-1).format, 'PNG');
  assert.equal(data.warnings.length, 0);
});

test('preserves cropped image fills and always removes temporary paint nodes', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  let removed = 0;
  let paint;
  const imageFill = { type: 'IMAGE', imageHash: 'photo', scaleMode: 'CROP', imageTransform: [[0.5, 0, 0.2], [0, 1, 0]] };
  const frame = { name: 'Cropped frame', type: 'FRAME', width: 400, height: 300, fills: [imageFill], children: [] };
  const figma = {
    currentPage: { selection: [frame] }, showUI: () => {},
    base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    createRectangle: () => ({ resize() {}, set fills(value) { paint = value; }, exportAsync: async () => new Uint8Array([1, 2, 3]), remove() { removed++; } }),
    ui: { postMessage: message => messages.push(message) },
  };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  const data = JSON.parse(result.json);
  assert.equal(data.frame.backgroundMode, 'EXACT');
  assert.equal(paint[0].imageHash, 'photo');
  assert.equal(removed, 1);
  figma.createRectangle = () => ({ resize() {}, exportAsync: async () => { throw new Error('Export failed'); }, remove() { removed++; } });
  await figma.ui.onmessage({ type: 'export' });
  assert.equal(messages.at(-1).type, 'error');
  assert.equal(removed, 2);
});

test('exports more than 9 MB of layer data and packs large results without losing text', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../../figma-plugin/ui.html', import.meta.url), 'utf8');
  const messages = [];
  const characters = 'Large campaign copy. '.repeat(500000);
  const text = { name: 'Campaign copy', type: 'TEXT', width: 500, height: 2000, characters, getStyledTextSegments: () => [{ characters, fontName: { family: 'Inter', style: 'Regular' }, fontSize: 16 }] };
  const frame = { name: 'Large frame', type: 'FRAME', width: 500, height: 2000, children: [text] };
  const figma = { currentPage: { selection: [frame] }, showUI: () => {}, ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages.map(message => message.type)));
  assert.ok(Buffer.byteLength(result.json) > 9 * 1024 * 1024);
  const elements = Object.fromEntries(['version', 'status', 'data', 'export', 'copy', 'download'].map(id => [id, { disabled: true, value: '', className: '' }]));
  const context = vm.createContext({ document: { getElementById: id => elements[id] }, parent: { postMessage() {} }, Blob, CompressionStream, Response, Uint8Array, btoa });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  await context.onmessage({ data: { pluginMessage: result } });
  assert.equal(elements.copy.disabled, false);
  assert.equal(elements.download.disabled, false);
  const packed = JSON.parse(vm.runInContext('exportPayload', context));
  assert.equal(packed.encoding, 'gzip-base64');
  assert.ok(packed.data.length < 200000);
  const { prepareInput } = await import('../src/services/inputService.js');
  const input = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(JSON.stringify(packed)) }, 'desktop');
  assert.equal(input.design.frame.children[0].text, characters);
});

test('repeated artwork is serialized once and restored as shared data', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const transform = [[1, 0, 0], [0, 1, 0]];
  const frame = { name: 'Repeated artwork', type: 'FRAME', width: 300, height: 200, children: [] };
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>');
  for (let index = 0; index < 2; index++) frame.children.push({ name: 'Icon', type: 'VECTOR', width: 20, height: 20, relativeTransform: transform, absoluteTransform: transform, exportAsync: async () => svg });
  const figma = { currentPage: { selection: [frame] }, showUI: () => {}, base64Encode: bytes => Buffer.from(bytes).toString('base64'), ui: { postMessage: message => messages.push(message) } };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result);
  const data = JSON.parse(result.json);
  assert.equal(Object.keys(data.assets).length, 1);
  assert.deepEqual(data.frame.children[0].asset, data.frame.children[1].asset);
  const { prepareInput } = await import('../src/services/inputService.js');
  const { convertDesign } = await import('../src/services/conversionService.js');
  const input = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(result.json) }, 'desktop');
  const output = await convertDesign(input, null, {});
  assert.equal(output.files.length, 1);
  assert.equal((output.html.match(/src="assets\/images\/artwork-1.webp"/g) || []).length, 2);
});

test('bound section colors and button borders survive computed CSS variables without fallbacks', async () => {
  const code = await readFile(new URL('../../figma-plugin/code.js', import.meta.url), 'utf8');
  const messages = [];
  const transform = [[1, 0, 0], [0, 1, 0]];
  const paint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, boundVariables: { color: { id: 'theme-color' } } };
  const frame = { name: 'Hero', type: 'FRAME', width: 1920, height: 760, children: [], fills: [paint], theme: { r: 1, g: 0.9, b: 0.75 }, getCSSAsync: async () => ({ background: 'var(--color-bg-cream)' }) };
  const button = { name: 'Button', type: 'FRAME', width: 183, height: 50, children: [], relativeTransform: transform, fills: [paint], theme: { r: 0.5, g: 0.75, b: 0.2 }, strokes: [paint], strokeWeight: 2, topLeftRadius: 6, getCSSAsync: async () => ({ background: 'var(--color-bg-primary)', border: '2px solid var(--color-border)' }) };
  frame.children.push(button);
  let variableReads = 0;
  const figma = {
    currentPage: { selection: [frame] }, showUI: () => {},
    variables: { getVariableByIdAsync: async () => { variableReads++; return { resolveForConsumer: node => ({ resolvedType: 'COLOR', value: node.theme }) }; } },
    ui: { postMessage: message => messages.push(message) },
  };
  vm.runInNewContext(code, { figma, __html__: '' });
  await figma.ui.onmessage({ type: 'export' });
  const result = messages.find(message => message.type === 'result');
  assert.ok(result, JSON.stringify(messages));
  const data = JSON.parse(result.json);
  assert.equal(data.frame.css.background, 'rgba(255,230,191,1)');
  assert.equal(data.frame.children[0].css.background, 'rgba(128,191,51,1)');
  assert.equal(data.frame.children[0].css['border-color'], 'rgba(128,191,51,1)');
  assert.equal(data.frame.children[0].css['border-top-left-radius'], '6px');
  assert.equal(variableReads, 1, 'Cache variable objects while resolving their mode per consumer');
  const { prepareInput } = await import('../src/services/inputService.js');
  const { convertDesign } = await import('../src/services/conversionService.js');
  const prepared = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(result.json) }, 'desktop');
  const output = await convertDesign(prepared, null, {});
  assert.match(output.html, /background:rgba\(255,230,191,1\)/);
  assert.match(output.html, /background:rgba\(128,191,51,1\)/);
  assert.match(output.html, /border-color:rgba\(128,191,51,1\)/);
});
