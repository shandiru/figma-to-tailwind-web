// Vercel's Express runtime imports the default-exported app as a serverless handler.
// Local development continues to use server.js, which starts the HTTP listener.
import app from './app.js';

export default app;
