import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { parseFigmaUrl, listFigmaFrames, importFigmaFrames } from '../src/services/figmaService.js';
import { prepareInput } from '../src/services/inputService.js';
import { convertLayers } from '../src/services/layerService.js';

const link = 'https://www.figma.com/design/Abc123/Design?node-id=1-2';
const box = (x, y, width, height) => ({ x, y, width, height });
const solid = { type: 'SOLID', color: { r: 0.2, g: 0.3, b: 0.4 } };
const frame = {
  id: '1:2', type: 'FRAME', name: 'Landing', absoluteBoundingBox: box(100, 200, 1440, 900), fills: [solid],
  children: [
    { id: '1:3', name: 'Heading', type: 'TEXT', characters: 'Hello world', absoluteBoundingBox: box(120, 230, 300, 60), fills: [solid], style: { fontFamily: 'Inter', fontSize: 32, fontWeight: 600 }, characterStyleOverrides: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1], styleOverrideTable: { 1: { fontWeight: 800 } } },
    { id: '1:4', name: 'Icon', type: 'VECTOR', absoluteBoundingBox: box(125, 300, 20, 20), absoluteRenderBounds: box(123, 298, 24, 24) },
  ],
};

test('accepts Figma links and rejects arbitrary hosts, malformed URLs and protocols', () => {
  assert.deepEqual(parseFigmaUrl(link), { key: 'Abc123', nodeId: '1:2' });
  for (const url of ['bad', 'https://evil.test/design/Abc123', 'https://figma.com.evil.test/design/Abc123', 'http://figma.com/design/Abc123']) assert.throws(() => parseFigmaUrl(url), { status: 400 });
});

test('browses page frames including sections and retains linked selection', async () => {
  const result = await listFigmaFrames({ url: link, token: 'test' }, async (url, opts) => {
    assert.match(url, /^https:\/\/api.figma.com\/v1\/files\/Abc123\?depth=3$/);
    assert.equal(opts.headers['X-Figma-Token'], 'test');
    return Response.json({ name: 'Website', document: { children: [{ name: 'Page 1', children: [{ type: 'SECTION', children: [frame, { ...frame, id: '2:2', visible: false }] }] }] } });
  });
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].page, 'Page 1');
  assert.equal(result.selectedNodeId, '1:2');
});

test('imports real layers and rendered leaf artwork into the existing editable converter', async () => {
  const png = await sharp({ create: { width: 24, height: 24, channels: 4, background: '#ff0000' } }).png().toBuffer();
  const calls = [];
  const request = async (url, options) => {
    calls.push(url);
    if (url.includes('/nodes?')) return Response.json({ nodes: { '1:2': { document: frame } } });
    if (url.includes('/images/')) return Response.json({ images: { '1:4': 'https://s3-alpha.figma.com/icon.png' } });
    assert.equal(options.headers, undefined, 'never send the Figma token to artwork hosts');
    return new Response(png);
  };
  const result = await importFigmaFrames({ url: link, token: 'secret', desktopId: '1:2' }, request);
  assert.equal(result.desktop.frame.children[0].x, 20);
  assert.equal(result.desktop.frame.children[0].segments[1].css['font-weight'], '800');
  assert.equal(result.desktop.frame.children[1].x, 23);
  const input = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(JSON.stringify(result.desktop)) }, 'desktop');
  const converted = await convertLayers(input, null, { pageName: 'Direct import' });
  assert.match(converted.html, /Hello /);
  assert.match(converted.html, /world/);
  assert.equal(converted.stats.textLayers, 1);
  assert.equal(converted.files.length, 1);
  assert.equal(calls.length, 3);
});

test('reports authentication and throttling failures without exposing the token', async () => {
  for (const status of [403, 404, 429]) {
    await assert.rejects(listFigmaFrames({ url: link, token: 'private-secret' }, async () => new Response('', { status })), error => !error.message.includes('private-secret') && error.status === (status === 429 ? 429 : 400));
  }
  await assert.rejects(listFigmaFrames({ url: link, token: '' }), /access token/);
  await assert.rejects(importFigmaFrames({ url: link, token: 'test', desktopId: '../../bad' }), /Select/);
});

test('rejects untrusted artwork URLs before making an outbound request', async () => {
  let calls = 0;
  await assert.rejects(importFigmaFrames({ url: link, token: 'test', desktopId: '1:2' }, async url => {
    calls++;
    if (url.includes('/nodes?')) return Response.json({ nodes: { '1:2': { document: frame } } });
    return Response.json({ images: { '1:4': 'https://localhost/private' } });
  }), /unsupported asset host/);
  assert.equal(calls, 2);
});
