import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vectorNetworkPaths } from '../src/services/vectorNetworkService.js';
import { clipboardLayers } from '../src/services/clipboardLayers.js';
import sharp from 'sharp';

const red = { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } };
function networkBlob({ reverse = false, curved = false } = {}) {
  const output = Buffer.alloc(12 + 3 * 12 + 3 * 28 + 8 + 4 + 3 * 4);
  let offset = 0;
  const uint = value => { output.writeUInt32LE(value, offset); offset += 4; };
  const float = value => { output.writeFloatLE(value, offset); offset += 4; };
  uint(3); uint(3); uint(1);
  for (const [x, y] of [[0, 0], [100, 0], [50, 100]]) { uint(0); float(x); float(y); }
  const segments = reverse ? [[1, 0], [1, 2], [2, 0]] : [[0, 1], [1, 2], [2, 0]];
  segments.forEach(([start, end], index) => {
    uint(0); uint(start); float(curved && index === 0 ? 10 : 0); float(curved && index === 0 ? 20 : 0);
    uint(end); float(curved && index === 0 ? -10 : 0); float(curved && index === 0 ? 20 : 0);
  });
  uint(1); uint(1); uint(3); uint(0); uint(1); uint(2);
  return output;
}
function vectorScene(vector, blobs) {
  return { nodeChanges: [{ guid: { sessionID: 1, localID: 1 }, name: 'Cloud', type: 'VECTOR', size: { x: 200, y: 100 }, fillPaints: [red], ...vector }], blobs: blobs.map(bytes => ({ bytes })) };
}

test('decodes filled vector-network regions with forward and reversed edges', () => {
  for (const reverse of [false, true]) {
    const { regions } = vectorNetworkPaths(networkBlob({ reverse }));
    assert.equal(regions[0].d, 'M0 0 L100 0 L50 100 L0 0 Z');
    assert.equal(regions[0].windingRule, 'NONZERO');
  }
});

test('reverses cubic control handles with the direction of a region edge', () => {
  const region = vectorNetworkPaths(networkBlob({ reverse: true, curved: true })).regions[0];
  assert.match(region.d, /M0 0 C-10 20 110 20 100 0/);
});

test('rejects truncated, out-of-range and extended network buffers', () => {
  assert.throws(() => vectorNetworkPaths(networkBlob().subarray(0, 20)), /counts/);
  const invalid = networkBlob(); invalid.writeUInt32LE(90, 12 + 3 * 12 + 4);
  assert.throws(() => vectorNetworkPaths(invalid), /vertex reference/);
  assert.throws(() => vectorNetworkPaths(Buffer.concat([networkBlob(), Buffer.from([0])])), /extension/);
});

test('imports a network-only vector as scaled artwork rather than a solid rectangle', async () => {
  const design = clipboardLayers(vectorScene({ vectorData: { vectorNetworkBlob: 0, normalizedSize: { x: 100, y: 100 } } }, [networkBlob()]));
  const svg = Buffer.from(design.assets[design.frame.asset.assetId], 'base64').toString();
  assert.match(svg, /scale\(2 1\)/);
  assert.match(svg, /M0 0 L100 0 L50 100 L0 0 Z/);
  assert.equal(design.frame.css.background, undefined);
  assert.deepEqual(design.issues, []);
  const pixels = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
  assert.equal(pixels[(99 * 200 + 1) * 4 + 3], 0, 'outside the triangle stays transparent');
  assert.equal(pixels[(30 * 200 + 100) * 4], 255, 'the actual vector interior retains its red fill');
});

test('preserves mixed vector path colors and intentionally empty path fills', () => {
  const path = Buffer.alloc(10); path[0] = 1; path.writeFloatLE(0, 1); path.writeFloatLE(0, 5); path[9] = 0;
  const design = clipboardLayers(vectorScene({ fillGeometry: [{ commandsBlob: 0, styleID: 1 }, { commandsBlob: 0, styleID: 2 }], vectorData: { styleOverrideTable: [{ styleID: 1, fillPaints: [{ type: 'SOLID', color: { r: 0, g: 1, b: 0, a: 1 } }] }, { styleID: 2, fillPaints: [] }] } }, [path]));
  const svg = Buffer.from(design.assets[design.frame.asset.assetId], 'base64').toString();
  assert.match(svg, /fill="rgba\(0,255,0,1\)"/);
  assert.match(svg, /fill="none"/);
  assert.doesNotMatch(svg, /rgba\(255,0,0,1\)/);
});

test('missing vector paths remain unpainted and produce an import issue', () => {
  const design = clipboardLayers(vectorScene({ effects: [{ type: 'DROP_SHADOW', radius: 10 }] }, []));
  assert.equal(design.frame.css.background, undefined);
  assert.equal(design.frame.css['box-shadow'], undefined);
  assert.equal(design.frame.asset, undefined);
  assert.equal(design.issues[0].kind, 'vector');
});

test('renders native stars as polygons and uses normal Figma text line spacing', () => {
  const design = clipboardLayers(vectorScene({ type: 'STAR', count: 5, starInnerScale: 0.4 }, []));
  const svg = Buffer.from(design.assets[design.frame.asset.assetId], 'base64').toString();
  assert.match(svg, /<polygon points=/);
  assert.deepEqual(design.issues, []);
  const text = clipboardLayers(vectorScene({ type: 'TEXT', textData: { characters: 'Moments that\nMatter' }, fontSize: 40 }, []));
  assert.equal(text.frame.css['line-height'], 'normal');
});
