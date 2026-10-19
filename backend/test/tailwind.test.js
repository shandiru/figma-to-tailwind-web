import assert from 'node:assert/strict';
import { test } from 'node:test';
import postcss from '../../frontend/node_modules/postcss/lib/postcss.mjs';
import tailwind from '../../frontend/node_modules/tailwindcss/lib/index.js';
import { convertDesign } from '../src/services/conversionService.js';
import { demoDesign } from '../../frontend/src/data/demo.js';
import { validateHtml } from '../src/services/validatorService.js';

test('generated Tailwind classes compile into fluid geometry, typography, colors and all five breakpoints', async () => {
  const { html } = await convertDesign({ kind: 'layers', design: demoDesign() }, { kind: 'layers', design: demoDesign(true) }, {});
  assert.deepEqual(validateHtml(html, { responsive: true }), []);
  assert.ok(!/\sstyle\s*=|<style\b|\.style\b/.test(html));
  const compiled = await postcss([tailwind({ content: [{ raw: html, extension: 'html' }], plugins: [] })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
  const declarations = [];
  compiled.root.walkDecls(declaration => declarations.push([declaration.prop, declaration.value]));
  assert.ok(declarations.some(([prop, value]) => prop === 'container-type' && value === 'inline-size'));
  assert.ok(declarations.some(([prop, value]) => prop === 'width' && value === '100cqw'));
  assert.ok(declarations.some(([prop, value]) => prop === 'font-size' && value.endsWith('cqw')));
  assert.ok(declarations.some(([prop, value]) => prop === 'background' && value === '#f5f2eb'));
  const media = [];
  compiled.root.walkAtRules('media', rule => media.push(rule.params));
  for (const width of [640, 768, 1024, 1280, 1536]) assert.ok(media.includes(`(min-width: ${width}px)`));
});
