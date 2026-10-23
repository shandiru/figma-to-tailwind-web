import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import archiver from 'archiver';
import { fileURLToPath } from 'node:url';
import { upload } from '../middleware/upload.js';
import { convert, history, downloadById } from '../controllers/convertController.js';
import { frames, importFrames } from '../controllers/figmaController.js';
import { pasteClipboard } from '../controllers/clipboardController.js';

const router = Router();
router.get('/plugin', (_req, res, next) => {
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', next);
  res.setHeader('Cache-Control', 'no-store');
  res.attachment('frame-to-code-plugin-v1.15.zip');
  archive.pipe(res);
  for (const file of ['manifest.json', 'code.js', 'ui.html', 'README.md']) {
    archive.file(fileURLToPath(new URL(`../../figma-plugin/${file}`, import.meta.url)), { name: `frame-to-code/${file}` });
  }
  archive.finalize().catch(next);
});
const convertLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many conversions. Try again in a few minutes.' },
});

router.post('/convert', convertLimiter, upload, convert);
router.post('/figma/frames', convertLimiter, frames);
router.post('/figma/import', convertLimiter, importFrames);
router.post('/clipboard', convertLimiter, pasteClipboard);
router.get('/history', history);
router.get('/history/:id/download', downloadById);

export default router;
