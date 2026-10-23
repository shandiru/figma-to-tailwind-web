import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { prepareInput } from '../services/inputService.js';
import { convertLayers } from '../services/layerService.js';

let active = 0;
export const previewLayers = asyncHandler(async (req, res) => {
  const layers = req.body?.layers;
  if (typeof layers !== 'string' || !layers) throw new ApiError(400, 'Upload a JSON file exported by the Figma plugin.');
  if (Buffer.byteLength(layers, 'utf8') > 128 * 1024 * 1024) throw new ApiError(413, 'Choose a JSON file smaller than 128 MB.');
  if (active >= 2) throw new ApiError(429, 'Other JSON imports are running. Try again in a moment.');
  active++;
  try {
    const input = await prepareInput({ mimetype: 'application/json', buffer: Buffer.from(layers) }, 'desktop');
    const { design } = input;
    const rendered = await convertLayers(input, null, { pageName: design.frame.name });
    let preview = rendered.html;
    for (const file of rendered.files) preview = preview.split(`assets/images/${file.file}`).join(`data:image/webp;base64,${file.buffer.toString('base64')}`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ design, preview, warnings: [...new Set([...(Array.isArray(design.warnings) ? design.warnings : []), ...rendered.warnings])] });
  } finally { active--; }
});
