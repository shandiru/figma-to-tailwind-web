import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import { requireAuth, requireCsrf } from './middleware/auth.js';

const app = express();
// Vercel/Node hosting forwards requests through one trusted proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: env.clientOrigins, credentials: true, exposedHeaders: ['X-Conversion-Id', 'Content-Disposition'] }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
// Authenticate before allocating memory for design uploads.
app.use('/api', requireAuth, requireCsrf);
app.use('/api/layers/preview', express.json({ limit: '140mb' }));
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
