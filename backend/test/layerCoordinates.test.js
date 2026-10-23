import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeLayerCoordinates } from '../src/services/layerCoordinates.js';
import { multiply } from '../src/utils/affine.js';
const t = (x, y) => [[1,0,x],[0,1,y]];

test('legacy group children are converted from containing-frame coordinates exactly once', () => {
  const text = { type: 'TEXT', transform: t(67,24) };
  const inner = { type: 'GROUP', transform: t(33,24), children: [text] };
  const outer = { type: 'GROUP', transform: t(0,0), children: [inner] };
  const button = { type: 'FRAME', transform: t(278,1673), children: [outer] };
  const design = { exporterVersion: '1.12', frame: { type: 'FRAME', children: [button] } };
  normalizeLayerCoordinates(design);
  assert.deepEqual(text.transform, t(34,0));
  assert.deepEqual(multiply(multiply(button.transform,inner.transform),text.transform), t(345,1697));
  const once = JSON.stringify(design);
  normalizeLayerCoordinates(design);
  assert.equal(JSON.stringify(design), once);
});

test('nested groups, rotations and nested frame coordinate boundaries are respected', () => {
  const text = { type: 'TEXT', transform: t(80,70) };
  const frameText = { type: 'TEXT', transform: t(5,6) };
  const frame = { type: 'FRAME', transform: t(200,300), children: [frameText] };
  const group = { type: 'GROUP', transform: [[0,-1,100],[1,0,50]], children: [text,frame] };
  const design = { exporterVersion: '1.11', frame: { type: 'FRAME', children: [group] } };
  normalizeLayerCoordinates(design);
  assert.deepEqual(multiply(group.transform,text.transform), t(80,70));
  assert.deepEqual(multiply(multiply(group.transform,frame.transform),frameText.transform), t(205,306));
});

test('native, unversioned and new parent-coordinate JSON are left unchanged', () => {
  for (const version of [undefined,'1.9','1.13']) {
    const design = { exporterVersion: version, frame: { type: 'FRAME', children: [{ type: 'GROUP', transform: t(30,40), children: [{ type: 'TEXT', transform: t(3,4) }] }] } };
    const before = JSON.stringify(design); normalizeLayerCoordinates(design);
    assert.equal(JSON.stringify(design),before);
  }
});
