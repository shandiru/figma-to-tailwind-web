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
import { nativeClipboardHtml, sampleMessage } from '../../backend/test/helpers/nativeClipboard.js';
import { gzipSync } from 'node:zlib';
import sharp from '../../backend/node_modules/sharp/lib/index.js';
import postcss from '../node_modules/postcss/lib/postcss.mjs';
import tailwind from '../node_modules/tailwindcss/lib/index.js';

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'frame-code-browser-'));
env.storageDir = path.join(profile, 'exports');
Conversion.create = async () => ({ id: 'browser-smoke', save: async () => {} });
const host = express();
let fidelityHtml = '';
host.get('/__fidelity', (_req, res) => res.type('html').send(fidelityHtml));
host.use((req, res, next) => req.path.startsWith('/api/') ? app(req, res, next) : next());
host.use(express.static(path.resolve('frontend/dist')));
const server = host.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
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
  await waitFor(`!!document.querySelector('[aria-label="Import source"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[aria-label="Import source"] button')).find(button => button.textContent === 'Paste design').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Paste copied Figma design"]')`);
  await evaluate(`(() => { const transfer = new DataTransfer(); transfer.setData('text/html', ${JSON.stringify(nativeClipboardHtml().replaceAll('<', '&lt;').replaceAll('>', '&gt;'))}); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true })); })()`);
  await waitFor(`!!document.querySelector('[aria-label="Design layers"]')`);
  const buttonScene = sampleMessage(); buttonScene.nodeChanges[0].name = 'Original clipboard button';
  await evaluate(`(() => { window.readOptions = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read: async options => { window.readOptions.push(options); return [{ types: ['image/png'] }, { types: ['text/html'], getType: async () => new Blob([${JSON.stringify(nativeClipboardHtml(buttonScene))}], {type:'text/html'}) }]; } } }); document.querySelector('[aria-label="Paste copied Figma design"]').click(); })()`);
  await waitFor(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).some(button => button.title.startsWith('Original clipboard button'))`);
  assert.deepEqual(await evaluate('window.readOptions[0]'), { unsanitized: ['text/html'] });
  const recovered = sampleMessage(); recovered.nodeChanges[0].name = 'Recovered keyboard';
  recovered.nodeChanges.push(
    { guid: { sessionID: 8, localID: 1 }, type: 'SYMBOL', name: 'Button master', size: { x: 180, y: 40 } },
    { guid: { sessionID: 8, localID: 2 }, parentIndex: { guid: { sessionID: 8, localID: 1 }, position: 'A' }, type: 'TEXT', name: 'Component label', size: { x: 160, y: 30 }, textData: { characters: 'Default button' } },
    { guid: { sessionID: 8, localID: 3 }, parentIndex: { guid: { sessionID: 1, localID: 2 }, position: 'Z' }, type: 'INSTANCE', name: 'Recovered button instance', size: { x: 180, y: 40 }, symbolData: { symbolID: { sessionID: 8, localID: 1 }, symbolOverrides: [{ guidPath: { guids: [{ sessionID: 8, localID: 2 }] }, textData: { characters: 'Native recovered button' } }] } },
    { guid: { sessionID: 8, localID: 4 }, parentIndex: { guid: { sessionID: 1, localID: 2 }, position: 'ZZ' }, type: 'RECTANGLE', name: 'Missing photo', size: { x: 80, y: 80 }, fillPaints: [{ type: 'IMAGE', image: {} }] }
  );
  await evaluate(`(() => { navigator.clipboard.read = async options => { window.readOptions.push(options); return [{types:['text/html'], getType:async()=>new Blob([${JSON.stringify(nativeClipboardHtml(recovered))}])}]; }; const transfer = new DataTransfer(); transfer.setData('text/html','<span>sanitized selection</span>'); document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true})); })()`);
  await waitFor(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).some(button => button.title.startsWith('Recovered keyboard'))`);
  assert.equal(await evaluate('window.readOptions.length'), 2, 'keyboard paste recovers original clipboard HTML when event data was sanitized');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(button => button.textContent === 'Download paste sample')`), true, 'incomplete native copies can be downloaded for diagnosis');
  await evaluate(`Array.from(document.querySelectorAll('[aria-label="Design layers"] button')).find(button => button.title.startsWith('Hero section')).click()`);
  await delay(800);
  await fs.mkdir('artifacts', { recursive: true });
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile('artifacts/native-paste-desktop.png', Buffer.from(screenshot.data, 'base64'));
  await evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Build selected section')).click()`);
  await waitFor(`!!document.querySelector('iframe[title="Generated page preview"]')`);
  await evaluate(`document.getElementById('tab-Code').click()`);
  await waitFor('!!document.querySelector("pre code")');
  const code = await evaluate('document.querySelector("pre code").textContent');
  assert.match(code, /Hero section/);
  assert.match(code, /Native recovered button/);
  assert.doesNotMatch(code, /Default button/);
  assert.doesNotMatch(code, /data-layer="(?:Footer|Landing page)"/);
  // Paste a separate mobile design, retaining the selected desktop section.
  await evaluate(`document.querySelector('[aria-label="Paste mobile version"]').click()`);
  const mobileScene = sampleMessage();
  mobileScene.nodeChanges[0].name = 'Mobile landing';
  mobileScene.nodeChanges[0].size.x = 390;
  mobileScene.nodeChanges[1].name = 'Mobile Hero section';
  mobileScene.nodeChanges[1].size = { x: 390, y: 500 };
  mobileScene.nodeChanges[2].size.x = 300;
  mobileScene.nodeChanges[3].size.x = 390;
  await evaluate(`(() => { const transfer = new DataTransfer(); transfer.setData('text/html', ${JSON.stringify(nativeClipboardHtml(mobileScene))}); document.body.dispatchEvent(new ClipboardEvent('paste', {clipboardData:transfer,bubbles:true,cancelable:true})); })()`);
  await waitFor(`!!document.querySelector('[data-canvas="mobile"] [aria-label="Design layers"]')`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Paste desktop version"]').parentElement.textContent.includes('Version ready')`), true, 'mobile paste retains the desktop slot');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Hero section')).getAttribute('aria-pressed')`), 'true', 'mobile paste retains desktop section selection');
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="mobile"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Mobile Hero section')).click()`);
  // Replacing desktop must also leave the mobile frame and section untouched.
  await evaluate(`document.querySelector('[aria-label="Paste desktop version"]').click()`);
  const replacement = sampleMessage();
  replacement.nodeChanges[0].name = 'Replacement desktop';
  replacement.nodeChanges[1].name = 'Desktop replacement hero';
  await evaluate(`(() => { const transfer = new DataTransfer(); transfer.setData('text/html', ${JSON.stringify(nativeClipboardHtml(replacement))}); document.body.dispatchEvent(new ClipboardEvent('paste', {clipboardData:transfer,bubbles:true,cancelable:true})); })()`);
  await waitFor(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).some(button => button.title.startsWith('Desktop replacement hero'))`);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-canvas="mobile"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Mobile Hero section')).getAttribute('aria-pressed')`), 'true', 'replacing desktop retains the mobile section');
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Desktop replacement hero')).click()`);
  await evaluate(`document.querySelector('[aria-label="Paste mobile version"]').click()`);
  await waitFor(`Array.from(document.querySelectorAll('[data-canvas="mobile"] button')).some(button => button.textContent.includes('Build responsive HTML'))`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="mobile"] button')).find(button => button.textContent.includes('Build responsive HTML')).click()`);
  await waitFor(`!!document.querySelector('iframe[title="Generated page preview"]')`);
  await evaluate(`document.getElementById('tab-Code').click()`);
  await waitFor('!!document.querySelector("pre code")');
  const responsiveCode = await evaluate('document.querySelector("pre code").textContent');
  assert.match(responsiveCode, /aria-label="desktop layout"/);
  assert.match(responsiveCode, /aria-label="mobile layout"/);
  assert.match(responsiveCode, /data-frame-width="1200" data-frame-height="400"/);
  assert.match(responsiveCode, /data-frame-width="390" data-frame-height="500"/);
  assert.match(responsiveCode, /Mobile Hero section/);
  assert.match(responsiveCode, /Desktop replacement hero/);
  assert.doesNotMatch(responsiveCode, /Footer/);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate(`document.getElementById('tab-Design').click()`);
  await waitFor(`!!document.querySelector('[aria-label="Design layers"]')`);
  await evaluate(`document.querySelector('[aria-label="Output workspace"]').scrollIntoView()`);
  await delay(200);
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('[data-canvas="mobile"] [aria-label="Design layers"] button')).find(button => button.title.startsWith('Mobile Hero section')).getAttribute('aria-pressed')`), 'true', 'mobile selection survives output tab changes');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'mobile page has no horizontal overflow');
  const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await fs.writeFile('artifacts/native-paste-mobile.png', Buffer.from(mobile.data, 'base64'));
  await evaluate(`document.querySelector('[aria-label="Remove mobile version"]').click()`);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Paste desktop version"]').parentElement.textContent.includes('Version ready')`), true, 'removing mobile retains desktop');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Paste mobile version"]').parentElement.textContent.includes('Version ready')`), false, 'only mobile is removed');
  // Complete plugin copies include real artwork bytes, unlike missing native image hashes.
  const photo = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 20, g: 180, b: 50 } } }).png().toBuffer();
  const complete = { format: 'figma-to-tailwind', version: 1, assets: { photo: photo.toString('base64') }, frame: { name: 'Complete design artwork', type: 'FRAME', width: 1200, height: 600, css: { background: '#fff' }, children: [{ name: 'Photo', type: 'RECTANGLE', x: 40, y: 40, width: 320, height: 240, asset: { assetId: 'photo' } }] } };
  complete.reference = { format: 'png', image: photo.toString('base64'), width: 1200, height: 600 };
  complete.frame.children = [{ name: 'Zero group', type: 'GROUP', width: 0, height: 0, children: [{ name: 'Small parent', type: 'FRAME', width: 40, height: 40, children: complete.frame.children }, { name: 'Text recovery', type: 'TEXT', width: 300, height: 30, y: 320, text: 'Recovered content', segments: [] }] }];
  complete.frame.children.push({ name: 'CTA / 4 /', type: 'FRAME', width: 1200, height: 180, x: 0, y: 400, children: [
    { name: 'Your space is waiting', type: 'TEXT', width: 350, height: 40, x: 40, y: 10, text: 'Your space is waiting' },
    { name: 'Button', type: 'FRAME', width: 180, height: 40, x: 40, y: 70, children: [{ name: 'Button label', type: 'TEXT', width: 160, height: 24, x: 10, y: 8, text: 'Join now' }] },
    { name: 'CTA caravan photo', type: 'RECTANGLE', width: 300, height: 120, x: 800, y: 20, asset: { assetId: 'photo' } }
  ] });
  await evaluate(`document.querySelector('[aria-label="Paste desktop version"]').click()`);
  await evaluate(`(() => { const transfer = new DataTransfer(); transfer.setData('text/plain', ${JSON.stringify(JSON.stringify(complete))}); document.body.dispatchEvent(new ClipboardEvent('paste', {clipboardData:transfer,bubbles:true,cancelable:true})); })()`);
  await waitFor(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Design layers"] button')).some(button => button.title.startsWith('Complete design artwork'))`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Compare with Figma"] button')).find(button => button.textContent === 'Figma original').click()`);
  await waitFor(`!!document.querySelector('img[alt="Figma original reference"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] [aria-label="Compare with Figma"] button')).find(button => button.textContent === 'Generated HTML').click()`);
  await waitFor(`!!document.querySelector('[data-canvas="desktop"] iframe[title="Pasted Figma design"]')`);
  await evaluate(`Array.from(document.querySelectorAll('[data-canvas="desktop"] button')).find(button => button.textContent.includes('Build selected section')).click()`);
  await waitFor(`!!document.querySelector('iframe[title="Generated page preview"]')`);
  const completePreview = await evaluate(`document.querySelector('iframe[title="Generated page preview"]').srcdoc`);
  assert.match(completePreview, /data-layer="Photo"/);
  const photoBytes = completePreview.match(/data:image\/webp;base64,([^"\s]+)/)?.[1];
  assert.ok(photoBytes, 'plugin photo bytes survive paste, conversion and preview embedding');
  const rgb = await sharp(Buffer.from(photoBytes, 'base64')).removeAlpha().raw().toBuffer();
  assert.ok(rgb[0] < 50 && rgb[1] > 150 && rgb[2] < 90, 'converted photo retains its source colors');
  // Upload JSON uses the same artwork preview and independent section selections.
  await evaluate(`document.getElementById('tab-Design').click(); Array.from(document.querySelectorAll('[aria-label="Import source"] button')).find(button => button.textContent === 'Upload JSON').click()`);
  const upload = async (index, payload, name = 'frame.json') => {
    await evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(payload)}], ${JSON.stringify(name)}, {type:'application/json'})); const input = document.querySelectorAll('input[type="file"]')[${index}]; input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  };
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
  console.log('Browser smoke passed: desktop/mobile merge, independent sections, complete plugin artwork and source color preservation.');
} finally {
  ws?.close(); browser.kill();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await delay(500);
  // Only remove the exact mkdtemp directory created above, within the OS temp root.
  if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('frame-code-browser-')) await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
