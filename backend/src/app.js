import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import { requireDatabase } from './middleware/database.js';

const app = express();
// Vercel/Node hosting forwards requests through one trusted proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.clientOrigins, credentials: true, exposedHeaders: ['X-Conversion-Id', 'Content-Disposition'] }));
// Vercel can import this exported app without executing server.js. Every API
// request must await MongoDB readiness before auth throttles or sessions query it.
app.use('/api', requireDatabase);
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});
app.use('/api/auth', authRoutes);
// The design workspace is available without an account. Authentication stays
// available for legacy account and admin endpoints under /api/auth.
app.use('/api/layers/preview', express.json({ limit: '140mb' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
