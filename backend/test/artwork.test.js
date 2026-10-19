import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { encodeArtwork } from '../src/services/artworkService.js';
import { convertDesign } from '../src/services/conversionService.js';

const svg = (width, height) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="red"/></svg>`).toString('base64');

test('caps a wide SVG within WebP dimensions instead of rejecting valid artwork', async () => {
  const result = await encodeArtwork(svg(20000, 2), 'Desktop / Hero / Wide decoration');
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 16383);
  assert.equal(result.reduced, true);
});

test('reduces SVG raster density when the initial pixel count exceeds the decoder limit', async () => {
  const result = await encodeArtwork(svg(5000, 4000), 'Desktop / Hero / Large vector');
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.width, 5000);
  assert.equal(metadata.height, 4000);
  assert.equal(result.reduced, true);
});

test('preserves ordinary artwork quality and identifies the actual layer for invalid data', async () => {
  const result = await encodeArtwork(svg(20, 10), 'Icon');
  assert.equal((await sharp(result.buffer).metadata()).width, 40);
  assert.equal(result.reduced, false);
  const input = { kind: 'layers', design: { format: 'figma-to-tailwind', version: 1, frame: { name: 'Desktop', type: 'FRAME', width: 1920, height: 1000, children: [{ name: 'Broken icon', type: 'VECTOR', width: 20, height: 20, asset: Buffer.from('not an image').toString('base64') }] } } };
  await assert.rejects(convertDesign(input, null, {}), error => error.status === 400 && /Desktop \/ Broken icon/.test(error.message) && /unsupported image format/.test(error.message));
});

test('renders Figma SVGs with XML attributes larger than the default parser buffer', async () => {
  const input = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><metadata data-embedded-photo="${'A'.repeat(10000100)}"/><rect width="20" height="10" fill="red"/></svg>`);
  await assert.rejects(sharp(input).metadata(), /XML_PARSE_HUGE|Buffer size limit exceeded|Resource limit exceeded/);
  const output = await encodeArtwork(input.toString('base64'), 'Campaign Page / Rectangle 7');
  const metadata = await sharp(output.buffer).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 40);
  assert.equal(metadata.height, 20);
  assert.equal(output.reduced, false);
});
