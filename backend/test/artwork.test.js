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

test('repairs thin stripe SVG raster viewports while retaining color and alpha', async () => {
  for (const [width, height, viewBox] of [['0.01', '20', '0 0 0.01 20'], ['20', '0.01', '0 0 20 0.01'], ['0', '20', '0 0 0.01 20'], ['100%', '100%', '0 0 0.01 20']]) {
    const input = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}"><rect width="100%" height="100%" fill="red" fill-opacity="0.5"/></svg>`);
    await assert.rejects(sharp(input, { density: 144 }).metadata(), /bad dimensions/);
    const output = await encodeArtwork(input.toString('base64'), 'Figure 130+ / Pattern stripes / Vector');
    const metadata = await sharp(output.buffer).metadata();
    assert.equal(output.viewportRepaired, true);
    assert.ok(metadata.width > 0 && metadata.height > 0);
    const pixels = await sharp(output.buffer).ensureAlpha().raw().toBuffer();
    assert.ok(pixels[0] > 240 && pixels[1] < 15 && pixels[2] < 15, 'original stripe stays red');
    assert.ok(pixels[3] >= 125 && pixels[3] <= 130, 'source transparency is retained');
  }
});

test('uses measured geometry for a zero-sized SVG without a usable viewBox', async () => {
  const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="20"><rect width="10" height="20" fill="blue"/></svg>').toString('base64');
  const output = await encodeArtwork(input, 'Zero width vector', { width: 10, height: 20 });
  const metadata = await sharp(output.buffer).metadata();
  assert.equal(output.usedGeometry, true);
  assert.equal(metadata.width, 20);
  assert.equal(metadata.height, 40);
});

test('repairs CSS viewport overrides without removing the vector fill style', async () => {
  const input = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20" viewBox="0 0 10 20" style="width:0px;height:0px;fill:rgb(0,128,0)"><rect width="10" height="20"/></svg>').toString('base64');
  const output = await encodeArtwork(input, 'Styled stripe');
  const pixels = await sharp(output.buffer).removeAlpha().raw().toBuffer();
  assert.ok(pixels[1] > 110 && pixels[0] < 15 && pixels[2] < 15);
  assert.equal(output.viewportRepaired, true);
});

test('a deeply nested stripe does not abort the page or change its measured HTML geometry', async () => {
  let stripe = { name: 'Vector', type: 'VECTOR', x: 3, y: 4, width: 0.01, height: 20, asset: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="20" viewBox="0 0 0.01 20"><rect width="0.01" height="20" fill="red"/></svg>').toString('base64') };
  for (const name of ['Group', 'Clip path group', 'Pattern stripes', 'Figure 130+', 'Impact figures', 'Our Impact']) stripe = { name, type: 'FRAME', x: 0, y: 0, width: 200, height: 100, children: [stripe] };
  const design = { format: 'figma-to-tailwind', version: 1, frame: { name: 'Desktop 1921', type: 'FRAME', width: 1921, height: 1000, children: [stripe] } };
  const output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.equal(output.files.length, 1);
  assert.match(output.html, /data-layer="Vector"/);
  assert.match(output.html, /w-\[0\.00052056cqw\]/);
  assert.equal(design.frame.children[0].children[0].width, 200);
  assert.ok(output.warnings.some(warning => /raster dimensions were repaired/.test(warning)));
});

test('shares repaired assets only when their required fallback geometry matches', async () => {
  const asset = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0"><rect width="100%" height="100%" fill="red"/></svg>').toString('base64');
  const children = [10, 20, 10].map((width, index) => ({ name: `Stripe ${index}`, type: 'VECTOR', x: index * 25, y: 0, width, height: 20, asset }));
  const output = await convertDesign({ kind: 'layers', design: { format: 'figma-to-tailwind', version: 1, frame: { name: 'Pattern', type: 'FRAME', width: 100, height: 100, children } } }, null, {});
  assert.equal(output.files.length, 2);
  assert.equal((output.html.match(/src="assets\/images\/artwork-1.webp"/g) || []).length, 2);
  assert.equal((await sharp(output.files[0].buffer).metadata()).width, 20);
  assert.equal((await sharp(output.files[1].buffer).metadata()).width, 40);
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


test('retains zero-sized unclipped groups, text without runs, and oversized artwork', async () => {
  const design = { format: 'figma-to-tailwind', version: 1, frame: { name: 'Desktop', type: 'FRAME', width: 1200, height: 600, children: [
    { name: 'Unclipped group', type: 'GROUP', width: 0, height: 0, children: [
      { name: 'Recovered copy', type: 'TEXT', width: 300, height: 80, text: 'Visible headline\nSecond paragraph', segments: [], paragraphSpacing: 12 },
      { name: 'Small parent', type: 'FRAME', width: 40, height: 40, children: [
        { name: 'Wide artwork', type: 'VECTOR', width: 320, height: 200, asset: svg(320, 200) }
      ] }
    ] },
    { name: 'Clipped empty', type: 'FRAME', width: 0, height: 0, clipsContent: true, children: [
      { type: 'TEXT', width: 100, height: 20, text: 'Invisible clipped copy' }
    ] }
  ] } };
  const output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.match(output.html, /Visible headline/);
  assert.match(output.html, /Second paragraph/);
  assert.doesNotMatch(output.html, /Invisible clipped copy/);
  assert.match(output.html, /data-layer="Wide artwork"[^>]*max-w-none/);
  assert.equal(output.files.length, 1);
});


test('PNG artwork retains exact visible RGB values and alpha through lossless WebP conversion', async () => {
  const pixels = Buffer.from([17, 143, 231, 255, 211, 37, 119, 128, 5, 221, 73, 64, 255, 209, 3, 255]);
  const input = await sharp(pixels, { raw: { width: 4, height: 1, channels: 4 } }).png().toBuffer();
  const output = await encodeArtwork(input.toString('base64'), 'Logo color details');
  const decoded = await sharp(output.buffer).ensureAlpha().raw().toBuffer();
  assert.deepEqual(decoded, pixels);
});
