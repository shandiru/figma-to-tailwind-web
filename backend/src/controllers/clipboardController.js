import { Worker } from 'node:worker_threads';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { prepareInput } from '../services/inputService.js';
import { convertLayers } from '../services/layerService.js';

let active = 0;
export const pasteClipboard = asyncHandler(async (req, res) => {
  const html = req.body?.html;
  const layers = req.body?.layers;
  const data = layers ?? html;
  const maxMb = layers != null ? 128 : 48;
  if (typeof data !== 'string' || !data || Buffer.byteLength(data, 'utf8') > maxMb * 1024 * 1024) throw new ApiError(413, `Import a design smaller than ${maxMb} MB.`);
  if (active >= 2) throw new ApiError(429, 'Other clipboard imports are running. Try again in a moment.');
  active++;
  try {
    let input;
    const design = layers != null ? (input = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(layers) }, 'desktop')).design : await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../services/clipboardWorker.js', import.meta.url), { workerData: html, resourceLimits: { maxOldGenerationSizeMb: 192 } });
      let finished = false;
      const timer = setTimeout(() => { worker.terminate(); reject(new ApiError(400, 'Clipboard import took too long. Copy a smaller section.')); }, 15000);
      const finish = (error, value) => { if (finished) return; finished = true; clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(value); };
      worker.once('message', data => finish(data.error ? new ApiError(400, data.error) : null, data.design));
      worker.once('error', () => finish(new ApiError(400, 'Could not read this Figma clipboard. Copy a smaller section or use the plugin.')));
      worker.once('exit', code => { if (code !== 0) finish(new ApiError(400, 'Clipboard import stopped. Copy a smaller section.')); });
    });
    input ??= await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(JSON.stringify(design)) }, 'desktop');
    const rendered = await convertLayers(input, null, { pageName: design.frame.name });
    let preview = rendered.html;
    for (const file of rendered.files) preview = preview.split(`assets/images/${file.file}`).join(`data:image/webp;base64,${file.buffer.toString('base64')}`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ design, preview, source: layers != null ? 'plugin' : 'native', warnings: [...new Set([...(Array.isArray(design.warnings) ? design.warnings : []), ...rendered.warnings])] });
  } finally { active--; }
});
