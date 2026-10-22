import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractSection, sectionEntries } from '../src/utils/sections.js';

const design = { format: 'figma-to-tailwind', version: 1, assets: { hero: 'aGVybw==', footer: 'Zm9vdGVy' }, frame: { name: 'Page', width: 1200, height: 900, children: [
  { name: 'Hero', x: 10, y: 100, width: 1100, height: 400, transform: [[1, 0, 10], [0, 1, 100]], backgroundImage: { assetId: 'hero' }, children: [{ name: 'Heading', type: 'TEXT', text: 'Only this section', x: 20, y: 30, width: 400, height: 50 }] },
  { name: 'Footer', x: 0, y: 800, width: 1200, height: 100, asset: { assetId: 'footer' } },
] } };

test('extracts only the selected section and its assets without mutating the pasted canvas', () => {
  const section = extractSection(design, [0]);
  assert.equal(section.frame.name, 'Hero');
  assert.equal(section.frame.x, 0);
  assert.equal(section.frame.y, 0);
  assert.equal(section.frame.transform, undefined);
  assert.equal(section.frame.children[0].text, 'Only this section');
  assert.deepEqual(Object.keys(section.assets), ['hero']);
  assert.equal(design.frame.children[0].y, 100);
  assert.equal(design.frame.children.length, 2);
  assert.throws(() => extractSection(design, [9]), /no longer available/);
});

test('maps nested layers into canvas coordinates for accurate selection outlines', () => {
  const entries = sectionEntries(design);
  const heading = entries.find(entry => entry.node.name === 'Heading');
  assert.deepEqual(heading.matrix, [1, 0, 0, 1, 30, 130]);
  assert.deepEqual(heading.path, [0, 0]);
  const root = extractSection(design, []);
  assert.equal(root.frame.children.length, 2);
  assert.equal(Object.keys(root.assets).length, 2);
});


test('keeps the original reference only for the entire matching frame', () => {
  const reference = { format: 'png', image: 'aW1hZ2U=', width: 1200, height: 900 };
  const source = { ...design, reference };
  assert.equal(extractSection(source, []).reference, reference);
  assert.equal(extractSection(source, [0]).reference, undefined);
  assert.equal(source.reference, reference);
});
