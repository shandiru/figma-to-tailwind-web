import { Conversion } from '../models/Conversion.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { prepareInput } from '../services/inputService.js';
import { convertDesign } from '../services/conversionService.js';
import { createZip } from '../services/zipService.js';
import mongoose from 'mongoose';

const clampWidth = (v, fallback) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 200 && n <= 4000 ? n : fallback;
};
const fileName = (name) => `${name.replace(/[^\w-]+/g, '-').toLowerCase() || 'page'}.zip`;

export const convert = asyncHandler(async (req, res) => {
  const desktopFile = req.files?.desktop?.[0];
  const tabletFile = req.files?.tablet?.[0];
  const mobileFile = req.files?.mobile?.[0];
  if (!desktopFile && !tabletFile && !mobileFile) throw new ApiError(400, 'Provide at least one design (desktop, tablet, or mobile).');

  let options = {};
  try {
    options = req.body.options ? JSON.parse(req.body.options) : {};
  } catch {
    throw new ApiError(400, 'options must be valid JSON.');
  }
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new ApiError(400, 'options must be a JSON object.');
  }
  const opts = {
    pageName: String(options.pageName || 'Untitled page').slice(0, 80),
    desktopWidth: clampWidth(options.desktopWidth, 1440),
    mobileWidth: clampWidth(options.mobileWidth, 390),
    format: ['html', 'react', 'vue'].includes(options.format) ? options.format : 'html',
  };

  const record = await Conversion.create({ name: opts.pageName, userId: req.user._id });
  try {
    const desktop = await prepareInput(desktopFile, 'desktop');
    const tablet = await prepareInput(tabletFile, 'tablet');
    const mobile = await prepareInput(mobileFile, 'mobile');
    const { html, files, stats, warnings } = await convertDesign(desktop, mobile, opts, tablet);
    const zipPath = await createZip(record.id, opts.pageName, html, files, { stats, warnings, format: opts.format });

    record.status = 'done';
    record.zipPath = zipPath;
    await record.save();

    res.setHeader('X-Conversion-Id', record.id);
    res.download(zipPath, fileName(opts.pageName));
  } catch (err) {
    record.status = 'failed';
    record.error = err.message;
    await record.save();
    throw err;
  }
});

export const history = asyncHandler(async (req, res) => {
  const items = await Conversion.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50).select('name status createdAt error');
  res.json(items);
});

export const downloadById = asyncHandler(async (req, res) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) throw new ApiError(404, 'Conversion not found.');
  const item = await Conversion.findOne({ _id: req.params.id, userId: req.user._id });
  if (!item || item.status !== 'done' || !item.zipPath) throw new ApiError(404, 'Conversion not found.');
  res.download(item.zipPath, fileName(item.name), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'ZIP file no longer exists.' });
  });
});
