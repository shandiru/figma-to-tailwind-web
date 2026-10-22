// Manual verification of a supplied plugin JSON; no database or remote design service.
// node frontend/test/design-fidelity.mjs <input.json> [output-directory]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import postcss from '../node_modules/postcss/lib/postcss.mjs';
import tailwind from '../node_modules/tailwindcss/lib/index.js';
import { prepareInput } from '../../backend/src/services/inputService.js';
import { convertDesign } from '../../backend/src/services/conversionService.js';
const inputPath = process.argv[2];
if (!inputPath) throw new Error('Supply the path to a plugin JSON export.');
const outputDir = path.resolve(process.argv[3] || 'artifacts/design-fidelity');
await fs.mkdir(outputDir, { recursive: true });
const input = await prepareInput({ mimetype: 'application/json', buffer: await fs.readFile(inputPath) }, 'desktop');
const result = await convertDesign(input, null, { pageName: input.design.frame.name });
let html = result.html;
for (const file of result.files) html = html.split(`assets/images/${file.file}`).join(`data:image/webp;base64,${file.buffer.toString('base64')}`);
const expected = [];
function walk(node, parent = [1, 0, 0, 1, 0, 0], name = '') {
  const m = node.transform || [[1,0,node.x || 0],[0,1,node.y || 0]];
  const [a,b,c,d,e,f] = parent;
  const matrix = [a*m[0][0]+c*m[1][0],b*m[0][0]+d*m[1][0],a*m[0][1]+c*m[1][1],b*m[0][1]+d*m[1][1],a*m[0][2]+c*m[1][2]+e,b*m[0][2]+d*m[1][2]+f];
  const corners = [[0,0],[node.width,0],[0,node.height],[node.width,node.height]].map(([x,y]) => [matrix[0]*x+matrix[2]*y+matrix[4],matrix[1]*x+matrix[3]*y+matrix[5]]);
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
  expected.push({ path: `${name}/${node.name}`, type: node.type, asset: !!node.asset, text: node.text, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys) });
  for (const child of node.children || []) walk(child,matrix,`${name}/${node.name}`);
}
walk(input.design.frame);
let index = 0;
html = html.replace(/data-layer="/g, () => `data-check-id="${index++}" data-layer="`);
assert.equal(index, expected.length, 'every source layer has a rendered element');
const compiled = await postcss([tailwind({ content: [{ raw: html, extension: 'html' }], plugins: [] })]).process('@tailwind base; @tailwind utilities;', { from: undefined });
let fontCss = '';
const verifyFonts = process.argv.includes('--fonts');
if (verifyFonts) {
  const links = [...html.matchAll(/<link[^>]*href="(https:\/\/fonts\.googleapis\.com[^"<>]+)"[^>]*>/gi)].map(match=>match[1].replaceAll('&amp;','&'));
  const fontFiles = new Map();
  for (const link of links) {
    const response = await fetch(link,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'}});
    if (!response.ok) throw new Error('Could not fetch the exported Google font CSS.');
    let css = await response.text();
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(match=>match[1]))];
    await Promise.all(urls.map(async url=>{
      if(fontFiles.has(url)) return;
      const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Could not fetch an exported font file.');
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>2*1024*1024)throw new Error('Font file too large.');
      fontFiles.set(url,`data:font/woff2;base64,${bytes.toString('base64')}`);
    }));
    for(const url of urls)css=css.split(url).join(fontFiles.get(url));
    fontCss += css;
  }
  console.log('Bundled exported Google fonts for the visual check.');
}
html = html.replace(/<link\b[^>]*fonts\.googleapis\.com[^>]*>/gi, '');
html = html.replace(/<script[^>]*src="https:\/\/cdn.tailwindcss.com"[^>]*><\/script>/, '').replace('</head>', `<style>${compiled.css}\n${fontCss}\nhtml{scrollbar-width:none}</style></head>`);
await fs.writeFile(path.join(outputDir,'generated.html'), html);
const ref = input.design.reference;
const referenceHtml = ref ? `<html><body style="margin:0"><img src="data:image/png;base64,${ref.image}" style="display:block;width:${ref.width}px;height:${ref.height}px"></body></html>` : '';
const server = createServer((req,res) => { res.setHeader('Content-Type','text/html'); res.end(req.url==='/reference' ? referenceHtml : html); });
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile = await fs.mkdtemp(path.join(os.tmpdir(),'design-fidelity-'));
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--disable-background-timer-throttling','--disable-renderer-backgrounding',`--user-data-dir=${profile}`,'about:blank'], { windowsHide:true, stdio:'ignore' });
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
let ws;
try {
  let port;
  for(let i=0;i<100;i++){try{port=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(100);}}
  assert.ok(port,'Chrome started');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
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
  const call = (method, params = {}) => new Promise((resolve, reject) => { const requestId = ++id; const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error(`CDP timed out: ${method} ${String(params.expression || '').slice(0,120)}`));},90000); pending.set(requestId, { resolve: value=>{clearTimeout(timer);resolve(value);}, reject: error=>{clearTimeout(timer);reject(error);} }); ws.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: false, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  const waitFor = async expression => {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Timed out: ${expression}`);
  };

  await call('Runtime.enable');
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  console.log(verifyFonts ? 'Rendering with bundled source fonts.' : 'Rendering local assets; typography not scored.');
  const frame = input.design.frame;
  await call('Emulation.setDeviceMetricsOverride',{width:frame.width,height:900,deviceScaleFactor:1,mobile:false});
  const base = `http://127.0.0.1:${server.address().port}`;
  await call('Page.navigate',{url:base});
  console.log('Design page committed.');
  await waitFor(`document.querySelectorAll('[data-check-id]').length === ${expected.length} && Array.from(document.images).every(image=>image.complete)`);
  if (verifyFonts) {
    const loaded = await call('Runtime.evaluate',{expression:'document.fonts.ready.then(()=>document.fonts.status)',awaitPromise:true,returnByValue:true});
    assert.equal(loaded.result.value,'loaded');
  }
  console.log('Local images loaded; auditing source geometry.');
  const actual=await evaluate(`Array.from(document.querySelectorAll('[data-check-id]')).map(el=>{const r=el.getBoundingClientRect();const style=getComputedStyle(el);return {id:Number(el.dataset.checkId), x:r.x,y:r.y,width:r.width,height:r.height,tag:el.tagName,text:el.textContent, color:style.color, opacity:style.opacity, naturalWidth:el.tagName==='IMG'?el.naturalWidth:undefined};})`);
  // The document scrollbar reduces available width; the page intentionally
  // scales its source frame to fit. Compare after accounting for that scale.
  const renderedScale = actual[0].width / expected[0].width;
  const discrepancies = actual.map(row=>({ ...expected[row.id], actual:row, delta:Math.max(...['x','y','width','height'].map(k=>Math.abs((row[k] - (k==='x' ? actual[0].x : k==='y' ? actual[0].y : 0)) / renderedScale-expected[row.id][k]))) })).filter(row=>row.delta>1);

  const brokenImages=actual.filter(row=>row.tag==='IMG'&&!row.naturalWidth);
  const report={ renderedScale, externalFonts: verifyFonts ? 'bundled and loaded' : 'not loaded; typography not scored', layers:expected.length, assets:result.files.length, exporterVersion:input.design.exporterVersion, warnings:result.warnings, geometryDiscrepancies:discrepancies, brokenImages, browserErrors:errors };
  await fs.writeFile(path.join(outputDir,'report.json'),JSON.stringify(report,null,2));
  const regionIndex = process.argv.indexOf('--regions');
  const regions = regionIndex >= 0 ? JSON.parse(process.argv[regionIndex + 1]) : [[0,0,frame.width,frame.height]];
  async function captureRegions(prefix, scale) {
    for (const [index, region] of regions.entries()) {
      const [x,y,width,height]=region;
      await evaluate(`window.scrollTo(0,${y*scale})`);
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:x*scale,y:y*scale,width:width*scale,height:height*scale,scale:1/scale}});
      await fs.writeFile(path.join(outputDir,regions.length===1?`${prefix}.png`:`${prefix}-${index+1}.png`),Buffer.from(shot.data,'base64'));
    }
  }
  await captureRegions('generated',renderedScale);
  if(ref){
    await call('Page.navigate',{url:`${base}/reference`});
    await waitFor('!!document.images[0]?.complete && document.images[0].naturalWidth > 0');
    await captureRegions('reference',1);
  }
  console.log(JSON.stringify({layers:expected.length,assets:result.files.length,geometryDiscrepancies:discrepancies.length,brokenImages:brokenImages.length,outputDir}));
}finally{
  ws?.close();browser.kill();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await delay(500);
  if(path.dirname(path.resolve(profile))===path.resolve(os.tmpdir())&&path.basename(profile).startsWith('design-fidelity-'))await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
