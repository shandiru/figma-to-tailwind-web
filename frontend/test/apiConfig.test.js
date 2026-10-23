import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveApiBase } from '../src/services/apiConfig.js';

test('production uses the frontend proxy despite a stale absolute API env value', () => {
  for (const configured of [undefined, '', '/api', 'https://figma-to-tailwind-web-nedo.vercel.app/api', 'https://another-backend.example/api/']) {
    assert.equal(resolveApiBase({ production: true, configured }), '/api');
  }
});
test('development supports the Vite proxy and a configured local backend', () => {
  assert.equal(resolveApiBase({ production: false }), '/api');
  assert.equal(resolveApiBase({ production: false, configured: '  http://localhost:5000/api/  ' }), 'http://localhost:5000/api');
});
