// Manual browser integration check: node frontend/test/browser-smoke.mjs
// Uses an isolated API with a simulated history record, never the running database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import express from '../../backend/node_modules/express/index.js';
import app from '../../backend/src/app.js';
import { Conversion } from '../../backend/src/models/Conversion.js';
import { env } from '../../backend/src/config/env.js';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import postcss from '../node_modules/postcss/lib/postcss.mjs';
import tailwind from '../node_modules/tailwindcss/lib/index.js';
import { mock } from 'node:test';
import { authStore } from '../../backend/test/helpers/authStore.js';
import { emailService } from '../../backend/src/services/emailService.js';
const sharp = createRequire(new URL('../../backend/package.json', import.meta.url))('sharp');

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-code-browser-'));
authStore(mock);
const otpMessages = [];
mock.method(emailService, 'sendVerification', async (_email, code) => otpMessages.push(code));
env.authSecret = 'isolated-browser-test-secret-never-for-production';
env.storageDir = path.join(profile, 'exports');
Conversion.create = async () => ({ id: 'browser-smoke', save: async () => {} });
const host = express();
let fidelityHtml = '';
host.get('/__fidelity', (_req, res) => res.type('html').send(fidelityHtml));
host.use((req, res, next) => req.path.startsWith('/api/') ? app(req, res, next) : next());
host.use(express.static(path.resolve('frontend/dist')));
const server = host.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
env.clientOrigins = [`http://127.0.0.1:${server.address().port}`];
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
browser.on('error', error => { console.error(error.message); });
let ws;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
  }
  assert.ok(port, 'Chromium started with a debugging port');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id); pending.delete(data.id);
      data.error ? reject(new Error(data.error.message)) : resolve(data.result);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; pending.set(requestId, { resolve, reject }); ws.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timed out: ${expression}`);
  };
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
  await waitFor(`!!document.getElementById('auth-email')`);
  await fs.mkdir('artifacts', { recursive: true });
  let authScreenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile('artifacts/login-desktop.png', Buffer.from(authScreenshot.data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'mobile auth has no horizontal overflow');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('button[type="submit"]')).borderRadius`), '0px');
  authScreenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile('artifacts/login-mobile.png', Buffer.from(authScreenshot.data, 'base64'));
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const fill = async (id, value) => evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Create an account')).click()`);
  await fill('auth-name', 'Browser Designer');
  await fill('auth-email', 'browser@example.com');
  await fill('auth-password', 'a long browser test passphrase');
  await evaluate('document.querySelector("form").requestSubmit()');
  await waitFor(`!!document.getElementById('auth-code')`);
  assert.equal(otpMessages.length, 1);
  await fill('auth-code', otpMessages[0]);
  await evaluate('document.querySelector("form").requestSubmit()');
  await waitFor(`!!document.querySelector('[aria-label="JSON uploads"]')`);
  await call('Page.reload');
  await waitFor(`!!document.querySelector('[aria-label="JSON uploads"]')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Sign out').click()`);
  await waitFor(`!!document.getElementById('auth-email')`);
  await fill('auth-email', 'browser@example.com');
  await fill('auth-password', 'a long browser test passphrase');
  await evaluate('document.querySelector("form").requestSubmit()');
  await waitFor(`!!document.querySelector('[aria-label="JSON uploads"]')`);
  assert.equal(await evaluate('document.body.textContent.includes("Paste design")'), false, 'Only JSON uploads are offered');
  const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 180, b: 50 } } }).png().toBuffer();
  const complete = { format: 'figma-to-tailwind', version: 1, assets: { photo: photo.toString('base64') }, frame: { name: 'Complete design artwork', type: 'FRAME', width: 1200, height: 600, css: { background: '#fff' }, children: [{ name: 'Photo', type: 'RECTANGLE', x: 40, y: 40, width: 320, height: 240, asset: { assetId: 'photo' } }] } };
  complete.reference = { format: 'png', image: photo.toString('base64'), width: 1200, height: 600 };
  complete.frame.children = [{ name: 'Zero group', type: 'GROUP', width: 0, height: 0, children: [{ name: 'Small parent', type: 'FRAME', width: 40, height: 40, children: complete.frame.children }, { name: 'Text recovery', type: 'TEXT', width: 300, height: 30, y: 320, text: 'Recovered content', segments: [] }] }];
  complete.frame.children.push({ name: 'CTA / 4 /', type: 'FRAME', width: 1200, height: 180, x: 0, y: 400, children: [
    { name: 'Your space is waiting', type: 'TEXT', width: 350, height: 40, x: 40, y: 10, text: 'Your space is waiting' },
    { name: 'Button', type: 'FRAME', width: 180, height: 40, x: 40, y: 70, children: [{ name: 'Button label', type: 'TEXT', width: 160, height: 24, x: 10, y: 8, text: 'Join now' }] },
    { name: 'CTA caravan photo', type: 'RECTANGLE', width: 300, height: 120, x: 800, y: 20, asset: { assetId: 'photo' } }
  ] });
  const upload = async (index, payload, name = 'frame.json') => {
    await evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(payload)}], ${JSON.stringify(name)}, {type:'application/json'})); const input = document.querySelectorAll('input[type="file"]')[${index}]; input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  };
  await upload(0, JSON.stringify(complete), 'desktop.json');
  await waitFor(`!!document.querySelector('[data-canvas="desktop"] [aria-label="Compare with Figma"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Compare with Figma"] button')).find(button => button.textContent === 'Figma original').click()`);
  await waitFor(`!!document.querySelector('img[alt="Figma original reference"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Compare with Figma"] button')).find(button => button.textContent === 'Generated HTML').click()`);
  await waitFor(`!!document.querySelector('[data-canvas="desktop"] iframe[title="Uploaded Figma design"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] button')).find(button => button.textContent.includes('Build selected section')).click()`);
  await waitFor(`!!document.querySelector('iframe[title="Generated page preview"]')`);
  const completePreview = await evaluate(`document.querySelector('iframe[title="Generated page preview"]').srcdoc`);
  assert.match(completePreview, /data-layer="Photo"/);
  const photoBytes = completePreview.match(/data:image\/webp;base64,([^"\s]+)/)?.[1];
  assert.ok(photoBytes, 'plugin photo bytes survive JSON upload, conversion and preview embedding');
  const rgb = await sharp(Buffer.from(photoBytes, 'base64')).removeAlpha().raw().toBuffer();
  assert.ok(rgb[0] < 50 && rgb[1] > 150 && rgb[2] < 90, 'converted photo retains its source colors');
  await evaluate(`document.getElementById('tab-Design').click()`);
  await upload(0, JSON.stringify(complete), 'desktop.json');
  await waitFor(`!!document.querySelector('[data-canvas="desktop"] [aria-label="Compare with Figma"]') && !document.querySelector('[role="tabpanel"] [role="status"]')?.textContent.includes('Reading')`);
  await waitFor(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).some(button => button.title.startsWith('Small parent') && !button.disabled)`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Small parent')).click()`);
  const mobileJson = structuredClone(complete); mobileJson.frame.name = 'Uploaded mobile'; mobileJson.frame.width = 390; delete mobileJson.reference;
  const packed = { format: 'figma-to-tailwind-packed', version: 1, encoding: 'gzip-base64', frame: { name: 'Uploaded mobile', width: 390, height: 600 }, count: 5, data: gzipSync(JSON.stringify(mobileJson)).toString('base64') };
  await upload(1, JSON.stringify(packed), 'mobile.json');
  await waitFor(`Array.from(document.querySelectorAll('[data-canvas="mobile"] [aria-label="Design layers"] button')).some(button => button.title.startsWith('Uploaded mobile') && !button.disabled)`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Small parent')).getAttribute('aria-pressed')`), 'true', 'mobile JSON upload keeps the desktop section');
  await upload(0, '{"invalid":true}', 'invalid.json');
  await waitFor(`!!document.querySelector('[role="alert"]')`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Small parent')).getAttribute('aria-pressed')`), 'true', 'invalid replacement retains the last valid desktop design');
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="mobile"] button')).find(button => button.textContent.includes('Build responsive HTML')).click()`);
  await waitFor(`!!document.querySelector('iframe[title="Generated page preview"]')`);
  const uploadedPreview = await evaluate(`document.querySelector('iframe[title="Generated page preview"]').srcdoc`);
  assert.match(uploadedPreview, /data-frame-width="40" data-frame-height="40"/);
  assert.match(uploadedPreview, /data-frame-width="390" data-frame-height="600"/);
  assert.match(uploadedPreview, /data-layer="Photo"/);
  assert.match(uploadedPreview, /data:image\/webp;base64/);
  assert.match(completePreview, /Recovered content/);
  assert.doesNotMatch(completePreview, /Figma original reference/);
  const compiled = await postcss([tailwind({ content: [{ raw: completePreview, extension: 'html' }], plugins: [] })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
  fidelityHtml = completePreview.replace(/<script[^>]*src="https:\/\/cdn.tailwindcss.com"[^>]*><\/script>/, '').replace('</head>', `<style>${compiled.css}</style></head>`);
  await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/__fidelity` });
  await waitFor(`!!document.querySelector('[data-layer="Photo"]')?.complete`);
  const geometry = await evaluate(`(() => { const image = document.querySelector('[data-layer="Photo"]'); const parent = document.querySelector('[data-layer="Small parent"]'); return { widthRatio: image.getBoundingClientRect().width / parent.getBoundingClientRect().width, heightRatio: image.getBoundingClientRect().height / parent.getBoundingClientRect().height, natural: image.naturalWidth, text: document.querySelector('[data-layer="Text recovery"]').textContent }; })()`);
  assert.ok(Math.abs(geometry.widthRatio - 8) < 0.02, 'Preflight does not shrink wide artwork to parent width');
  assert.ok(Math.abs(geometry.heightRatio - 6) < 0.02, 'artwork retains its original aspect geometry');
  assert.ok(geometry.natural > 0, 'artwork decoded in browser');
  assert.match(geometry.text, /Recovered content/);
  const ctaGeometry = await evaluate(`(() => { const photo = document.querySelector('[data-layer="CTA caravan photo"]'); const section = document.querySelector('[data-layer="CTA / 4 /"]'); return { retained: photo.closest('[data-layer="CTA / 4 /"]') === section, top: photo.getBoundingClientRect().top - section.getBoundingClientRect().top, scale: section.getBoundingClientRect().width / 1200, tag: section.tagName }; })()`);
  assert.equal(ctaGeometry.retained, true, 'browser must keep the lower CTA photo inside its own section');
  assert.equal(ctaGeometry.tag, 'DIV', 'CTA section containing buttons must stay a container');
  assert.ok(Math.abs(ctaGeometry.top - 20 * ctaGeometry.scale) < 1, 'lower section photo must not jump to the top of the page');
  assert.deepEqual(errors, [], 'no browser runtime exceptions');
  console.log('Browser smoke passed: registration, email OTP, cookie restore, logout/login, desktop/mobile merge, independent sections, artwork and source colors.');
} finally {
  ws?.close(); browser.kill();
  mock.restoreAll();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await delay(500);
  // Only remove the exact mkdtemp directory created above, within the OS temp root.
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('frame-code-browser-')) await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
