import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { readResult } from '../src/utils/zip.js';

test('embeds WebP images and CSS backgrounds in the sandbox preview while preserving ZIP paths in source', async t => {
  t.mock.method(URL, 'createObjectURL', () => assert.fail('Preview must not depend on blob URL origins or lifecycle'));
  const zip = new JSZip();
  const bytes = Buffer.from('test image bytes');
  const html = '<html><body><img src="assets/images/artwork-1.webp"><div style="background-image:url(&#39;assets/images/background-2.webp&#39;)"></div><img src="assets/images/artwork-1.webp"></body></html>';
  zip.file('output/index.html', html);
  zip.file('output/assets/images/artwork-1.webp', bytes);
  zip.file('output/assets/images/background-2.webp', bytes);
  zip.file('output/conversion.json', JSON.stringify({ stats: { assets: 2 }, warnings: [] }));
  const result = await readResult(await zip.generateAsync({ type: 'uint8array' }));
  assert.equal(result.code, html);
  assert.ok(!result.preview.includes('assets/images/'));
  assert.ok(!result.preview.includes('blob:'));
  assert.equal((result.preview.match(/data:image\/webp;base64,/g) || []).length, 3);
  assert.match(result.preview, new RegExp(bytes.toString('base64')));
  assert.equal(result.stats.assets, 2);
});
