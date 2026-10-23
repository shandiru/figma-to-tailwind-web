import 'dotenv/config';
import path from 'node:path';

export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  maxFileMb: Number(process.env.MAX_FILE_MB) || 128,
  storageDir: path.resolve('storage'),
};
