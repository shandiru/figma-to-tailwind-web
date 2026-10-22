import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileFromTransfer } from '../src/utils/clipboard.js';
import { demoDesign } from '../src/data/demo.js';
const transfer = (text = '', files = [], html = '') => ({ files, getData: type => type === 'text/plain' ? text : html });

test('pastes structured plugin layers with text and geometry intact', async () => {
  const json = JSON.stringify(demoDesign());
  const file = fileFromTransfer(transfer(json));
  assert.equal(file.type, 'application/json');
  assert.equal(await file.text(), json);
});

test('accepts downloaded plugin JSON with missing MIME type', async () => {
  const json = JSON.stringify(demoDesign());
  const file = fileFromTransfer(transfer('', [new File([json], 'frame.json')]));
  assert.equal(file.type, 'application/json');
  assert.equal(await file.text(), json);
});

test('accepts compressed layer exports without discarding their packed data', async () => {
  const packed = { format: 'figma-to-tailwind-packed', version: 1, encoding: 'gzip-base64', frame: { name: 'Campaign', width: 1440, height: 3000 }, count: 500, data: 'packed-data' };
  const result = fileFromTransfer(transfer(JSON.stringify(packed)));
  assert.deepEqual(JSON.parse(await result.text()), packed);
});

test('rejects native Figma metadata and screenshots with editable layer instructions', () => {
  assert.throws(() => fileFromTransfer(transfer('', [], '<span data-figma="binary">Frame</span>')), /Copy layers/);
  assert.throws(() => fileFromTransfer(transfer('', [new File(['png'], 'frame.png', { type: 'image/png' })])), /screenshots/i);
  assert.throws(() => fileFromTransfer(transfer('{broken')), /incomplete/);
  assert.equal(fileFromTransfer(transfer()), null);
});
