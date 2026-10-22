import { asyncHandler } from '../utils/ApiError.js';
import { listFigmaFrames, importFigmaFrames } from '../services/figmaService.js';

const input = req => ({ ...req.body, token: req.body?.token || process.env.FIGMA_ACCESS_TOKEN });
export const frames = asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await listFigmaFrames(input(req)));
});
export const importFrames = asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await importFigmaFrames(input(req)));
});
