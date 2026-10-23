import 'dotenv/config';
import path from 'node:path';
import os from 'node:os';

export const env = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  clientOrigins: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean),
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: Number(process.env.SMTP_PORT) || 465,
  authSecret: process.env.AUTH_SECRET,
  superAdminCreateKeyword: process.env.SUPER_ADMIN_CREATE_KEYWORD,
  secureCookies: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
  cookieSameSite: process.env.COOKIE_SAME_SITE === 'none' ? 'none' : 'lax',
  maxFileMb: Number(process.env.MAX_FILE_MB) || 128,
  storageDir: process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : process.env.VERCEL ? path.join(os.tmpdir(), 'frame-exports') : path.resolve('storage'),
};
