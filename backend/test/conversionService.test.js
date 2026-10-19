import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convertDesign } from '../src/services/conversionService.js';
import { prepareInput } from '../src/services/inputService.js';
import { demoDesign } from '../../frontend/src/data/demo.js';
const input = () => ({ kind: 'layers', design: demoDesign() });

test('builds editable text and button elements without any network requests or frame images', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('No AI or external API call allowed'));
  const output = await convertDesign(input(), null, { pageName: '<script>unsafe</script>' });
  assert.match(output.html, /Good things/);
  assert.match(output.html, /<button type="button" data-layer="CTA button"/);
  assert.match(output.html, /max-w-\[1080px\]/);
  assert.ok(!/\sstyle\s*=|<style\b|\.style\b/.test(output.html));
  assert.equal((output.html.match(/<script\b/g) || []).length, 1, 'Only the Tailwind CDN loader is needed');
  assert.match(output.html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.ok(!output.html.includes('<img'));
  assert.equal(output.files.length, 0);
  assert.ok(output.stats.textLayers >= 5);
});

test('uses actual frame geometry and independently renders both responsive variants', async () => {
  const output = await convertDesign(input(), { kind: 'layers', design: demoDesign(true) }, {});
  assert.match(output.html, /data-frame-width="1080"/);
  assert.match(output.html, /data-frame-width="390"/);
  assert.match(output.html, /md:block/);
  assert.match(output.html, /md:hidden/);
  for (const prefix of ['sm', 'md', 'lg', 'xl', '2xl']) assert.ok(output.html.includes(`${prefix}:`));
  assert.ok(!output.html.includes('ResizeObserver'));
  assert.deepEqual(output.stats.frames.desktop, { width: 1080, height: 680 });
});

test('escapes text and filters unsafe visual styles, retaining token fallbacks', async () => {
  const design = demoDesign();
  design.frame.css = { background: 'var(--Paper, #fff)', color: 'red;position:fixed', 'background-image': 'url(https://example.test/track)' };
  design.frame.children = [{ type: 'TEXT', width: 200, height: 50, text: '<img onerror="bad">', css: { color: '#112233' } }];
  const output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.match(output.html, /&lt;img onerror=&quot;bad&quot;&gt;/);
  assert.match(output.html, /background:#fff/);
  assert.ok(!output.html.includes('example.test'));
  assert.ok(!output.html.includes('position:fixed'));
});

test('creates assets for individual artwork, while preserving adjacent text', async () => {
  const design = demoDesign();
  design.frame.children.push({ type: 'VECTOR', name: 'Star', width: 20, height: 20, asset: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>').toString('base64') });
  const output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.equal(output.files.length, 1);
  assert.match(output.html, /assets\/images\/artwork-1.webp/);
  assert.match(output.html, /Good things/);
  assert.equal(output.stats.assets, 1);
});

test('accepts valid plugin JSON and rejects screenshots, metadata and malformed layer data', async () => {
  const prepared = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(JSON.stringify(demoDesign())) }, 'desktop');
  assert.equal(prepared.kind, 'layers');
  await assert.rejects(convertDesign({ kind: 'image' }, null, {}), err => err.status === 400 && /Figma plugin/.test(err.message));
  await assert.rejects(convertDesign({ kind: 'text' }, null, {}), err => err.status === 400);
  await assert.rejects(prepareInput({ mimetype: 'application/json', buffer: Buffer.from('{}') }, 'desktop'), err => err.status === 400);
  const invalid = input(); invalid.design.frame.children = 'broken';
  await assert.rejects(convertDesign(invalid, null, {}), err => err.status === 400);
  await assert.rejects(convertDesign(null, null, {}), err => err.status === 400);
});

test('preserves nested CSS color fallbacks and warns when an old export lacks token values', async () => {
  const design = demoDesign();
  design.frame.css = { background: 'var(--cream, rgba(255, 230, 191, 1))', border: '1px solid var(--border, var(--fallback, rgb(100, 120, 140)))' };
  let output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.match(output.html, /background:rgba\(255,_230,_191,_1\)/);
  assert.match(output.html, /border:0\.09259259cqw_solid_rgb\(100,_120,_140\)/);
  assert.equal(output.warnings.length, 0);
  design.frame.css = { background: 'var(--color-bg-cream)' };
  output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.match(output.warnings[0], /Re-export with plugin v1.4/);
  design.frame.resolvedCss = { background: 'rgba(255,230,191,1)' };
  output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.match(output.html, /background:rgba\(255,230,191,1\)/);
  assert.equal(output.warnings.length, 0);
});

test('loads only the actual font weights and isolates public fonts from custom font failures', async () => {
  const design = demoDesign();
  design.fonts = ['Figtree', 'Private Font'];
  design.frame.children = [
    { name: 'Heading', type: 'TEXT', width: 300, height: 80, text: 'Heading', css: { 'font-family': 'Figtree', 'font-weight': '700', 'font-size': '40px' } },
    { name: 'Body', type: 'TEXT', width: 300, height: 40, text: 'Body', css: { 'font-family': 'Figtree', 'font-weight': '400', 'font-size': '17px' } },
    { name: 'Custom', type: 'TEXT', width: 300, height: 40, text: 'Custom', css: { 'font-family': 'Private Font', 'font-weight': '600' } },
  ];
  const output = await convertDesign({ kind: 'layers', design }, null, {});
  assert.match(output.html, /family=Figtree:ital,wght@0,400;0,700/);
  assert.match(output.html, /family=Private%20Font:ital,wght@0,600/);
  assert.ok(!output.html.includes('wght@100;200'));
  assert.equal((output.html.match(/fonts\.googleapis\.com\/css2/g) || []).length, 2);
  assert.match(output.html, /shrink-0 whitespace-pre-wrap/);
});

test('retains Figma child coordinates inside bordered cards and renders paragraph spacing without dropping runs', async () => {
  const design = demoDesign();
  design.frame.width = 1000;
  design.frame.children = [{ name: 'Card', type: 'FRAME', width: 300, height: 200, css: { 'border-color': '#333', 'border-style': 'solid', 'border-width': '4px' }, children: [
    { name: 'Body', type: 'TEXT', x: 24, y: 20, width: 240, height: 120, text: 'One\nTwo', paragraphSpacing: 16, css: { 'font-size': '16px' }, segments: [{ text: 'One\n', css: { 'font-weight': '700' } }, { text: 'Two', css: { color: '#123456' } }] },
  ] }];
  const { html } = await convertDesign({ kind: 'layers', design }, null, {});
  const body = html.match(/<div data-layer="Body"[\s\S]*?<\/div>/)[0];
  assert.match(body, /left-\[2cqw\]/);
  assert.match(body, /top-\[1\.6cqw\]/);
  assert.match(body, /mt-\[1\.6cqw\]/);
  assert.match(body, /font-\[700\]/);
  assert.match(body, /text-\[color:#123456\]/);
  assert.match(body, /One/);
  assert.match(body, /Two/);
});
