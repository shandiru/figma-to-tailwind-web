import multer from 'multer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const ALLOWED = /^(application\/json|image\/(png|jpe?g|webp|svg\+xml)|text\/(html|plain))$/;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxFileMb * 1024 * 1024, files: 2 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.test(file.mimetype) ? cb(null, true) : cb(new ApiError(415, `Unsupported file type: ${file.mimetype}`)),
}).fields([
  { name: 'desktop', maxCount: 1 },
  { name: 'mobile', maxCount: 1 },
]);
