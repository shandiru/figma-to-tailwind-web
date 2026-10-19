import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes/index.js';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();
app.use(helmet());
app.use(cors({ origin: env.clientUrl, exposedHeaders: ['X-Conversion-Id', 'Content-Disposition'] }));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
