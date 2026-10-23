import { database } from '../config/db.js';

export async function requireDatabase(_req, res, next) {
  try {
    await database.connect();
  } catch (error) {
    // Connection errors can include infrastructure details; never return them
    // or a connection string to the browser.
    console.error('Database connection failed', { type: error.name, code: error.code || error.cause?.code || 'UNKNOWN' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'Database is temporarily unavailable. Please try again shortly.' });
  }
  next();
}
