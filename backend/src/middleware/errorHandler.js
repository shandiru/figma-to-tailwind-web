import multer from 'multer';
import { env } from '../config/env.js';

export const notFound = (req, _res, next) => {
  const err = new Error(`Not found: ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: `This export exceeds the ${env.maxFileMb} MB upload limit. Export the frame in sections or increase MAX_FILE_MB on the backend.` });
  }
  let status = err.status || 500;
  if (err instanceof multer.MulterError) status = 400;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : err.message });
}
