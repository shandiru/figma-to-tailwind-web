import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from '../../frontend/node_modules/jszip/lib/index.js';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { Conversion } from '../src/models/Conversion.js';
import { demoDesign } from '../../frontend/src/data/demo.js';
import { gzipSync } from 'node:zlib';

test('multipart layer upload produces an editable HTML ZIP and plugin download includes all files', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'f2t-layers-test-'));
  const storageDir = env.storageDir;
  env.storageDir = directory;
  t.mock.method(Conversion, 'create', async () => ({ id: 'layer-workflow-test', save: async () => {} }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    env.storageDir = storageDir;
    for (const file of await readdir(directory)) await unlink(path.join(directory, file));
    await rmdir(directory);
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const body = new FormData();
  body.append('desktop', new Blob([JSON.stringify(demoDesign())], { type: 'application/json' }), 'layers.json');
  body.append('options', JSON.stringify({ pageName: 'Editable workflow' }));
  const response = await fetch(`${base}/convert`, { method: 'POST', body });
  assert.equal(response.status, 200, await response.clone().text());
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const html = await zip.file('output/index.html').async('string');
  const report = JSON.parse(await zip.file('output/conversion.json').async('string'));
  assert.match(html, /Good things/);
  assert.match(html, /<button/);
  assert.ok(!html.includes('<img'));
  assert.ok(report.stats.textLayers > 0);
  assert.equal(response.headers.get('x-conversion-id'), 'layer-workflow-test');
  const packed = {
    format: 'figma-to-tailwind-packed', version: 1, encoding: 'gzip-base64',
    frame: { name: 'Packed frame', width: 1080, height: 680 }, count: 15,
    data: gzipSync(Buffer.from(JSON.stringify(demoDesign()))).toString('base64'),
  };
  const packedBody = new FormData();
  packedBody.append('desktop', new Blob([JSON.stringify(packed)], { type: 'application/json' }), 'packed-layers.json');
  const packedResponse = await fetch(`${base}/convert`, { method: 'POST', body: packedBody });
  assert.equal(packedResponse.status, 200, await packedResponse.clone().text());
  const packedZip = await JSZip.loadAsync(await packedResponse.arrayBuffer());
  assert.match(await packedZip.file('output/index.html').async('string'), /Good things/);

  const invalidBody = new FormData();
  invalidBody.append('desktop', new Blob([JSON.stringify({ ...packed, data: 'not-gzip' })], { type: 'application/json' }), 'invalid.json');
  const invalidResponse = await fetch(`${base}/convert`, { method: 'POST', body: invalidBody });
  assert.equal(invalidResponse.status, 400);
  const pluginResponse = await fetch(`${base}/plugin`);
  assert.equal(pluginResponse.status, 200);
  const plugin = await JSZip.loadAsync(await pluginResponse.arrayBuffer());
  for (const file of ['manifest.json', 'code.js', 'ui.html', 'README.md']) assert.ok(plugin.file(`frame-to-code/${file}`));
  const manifest = JSON.parse(await plugin.file('frame-to-code/manifest.json').async('string'));
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none']);
});
