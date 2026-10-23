import assert from 'node:assert/strict';
import { test } from 'node:test';
import { figmaPayload } from '../src/utils/figmaClipboard.js';
import { clipboardInput, clipboardProblem, readOriginalClipboard, snapshotTransfer } from '../src/utils/nativeClipboard.js';
import { demoDesign } from '../src/data/demo.js';

const payload = Buffer.from('fig-kiwi' + '\0'.repeat(20)).toString('base64');
const html = `<!--(figma)${payload}(/figma)-->`;

test('accepts original, HTML-escaped, marker-only and bare data-buffer payloads', () => {
  for (const value of [html, html.replaceAll('<', '&lt;').replaceAll('>', '&gt;'), html.replaceAll('(', '&#40;').replaceAll(')', '&#41;'), `(figma)${payload}(/figma)`, `<span data-buffer="${payload}"></span>`, payload]) {
    assert.equal(figmaPayload(value), payload);
    assert.deepEqual(clipboardInput([value]), { html });
  }
  assert.equal(figmaPayload('<script>throw new Error("executed")</script>'), null);
  assert.equal(figmaPayload('<!--(figma)not-a-payload(/figma)-->'), null);
});

test('retains plain-text and custom Figma representations from keyboard paste', () => {
  const snapshot = snapshotTransfer({ types: ['text/plain', 'application/x-figma'], getData: type => type === 'application/x-figma' ? payload : type === 'text/plain' ? 'Frame' : '' });
  assert.deepEqual(clipboardInput(snapshot.values), { html });
  const layers = JSON.stringify(demoDesign());
  assert.deepEqual(clipboardInput(['Frame', layers]), { layers });
});

test('paste button requests original HTML and checks all clipboard representations', async () => {
  const snapshot = await readOriginalClipboard({ read: async options => {
    assert.deepEqual(options, { unsanitized: ['text/html'] });
    return [{ types: ['image/png'] }, { types: ['text/html', 'text/plain'], getType: async type => new Blob([type === 'text/html' ? html : 'Frame']) }];
  } });
  assert.deepEqual(snapshot.types, ['image/png', 'text/html', 'text/plain']);
  assert.deepEqual(clipboardInput(snapshot.values), { html });
});

test('falls back for unsupported read options but does not retry denied permission', async () => {
  let calls = 0;
  await readOriginalClipboard({ read: async options => {
    calls++;
    if (options) throw new TypeError('unsupported options');
    return [];
  } });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(readOriginalClipboard({ read: async () => { calls++; throw new DOMException('denied', 'NotAllowedError'); } }), { name: 'NotAllowedError' });
  assert.equal(calls, 1);
});

test('reports the actual missing data type rather than blaming every paste on screenshots', () => {
  assert.match(clipboardProblem({ types: ['text/html'], values: ['<span>Frame</span>'] }), /HTML.*payload is missing/);
  assert.match(clipboardProblem({ types: ['image/png'], values: [] }), /image without editable/);
  assert.match(clipboardProblem({ types: ['text/plain'], values: ['Heading'] }), /Only text/);
  assert.match(clipboardProblem({ types: ['text/plain'], values: ['https://figma.com/design/abc'] }), /contains a link/);
});
