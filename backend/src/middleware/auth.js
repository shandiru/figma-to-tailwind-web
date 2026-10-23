import { AuthSession, AuthThrottle } from '../models/Auth.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { safeEqual, tokenHash } from '../services/authSecurity.js';

export const COOKIE_NAME = 'frame_session';
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const cookieOptions = () => ({ httpOnly: true, secure: env.secureCookies, sameSite: env.cookieSameSite, path: '/api', maxAge: SESSION_MS });
export function sessionToken(req) {
  return req.headers.cookie?.split(';').map(item => item.trim()).find(item => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
}
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = sessionToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, 'Sign in to continue.');
  const session = await AuthSession.findOne({ _id: tokenHash(token), expiresAt: { $gt: new Date() } });
  if (!session) throw new ApiError(401, 'Your session has expired. Please sign in again.');
  const user = await User.findById(session.userId);
  if (!user?.verifiedAt) throw new ApiError(401, 'Sign in with a verified account.');
  req.user = user; req.authSession = session;
  res.setHeader('Cache-Control', 'no-store');
  next();
});
export function checkOrigin(req, _res, next) {
  if (req.headers.origin && !env.clientOrigins.includes(req.headers.origin)) return next(new ApiError(403, 'This request origin is not allowed.'));
  next();
}
export function requireCsrf(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!safeEqual(req.headers['x-csrf-token'], req.authSession?.csrfToken)) return next(new ApiError(403, 'Your security token is missing or expired. Refresh the page and try again.'));
  checkOrigin(req, _res, next);
}
// Mongo-backed limits apply across serverless instances and redeployments.
export async function consumeLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const _id = tokenHash(`${key}:${bucket}`);
  let item;
  try {
    item = await AuthThrottle.findOneAndUpdate({ _id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * windowMs) } }, { upsert: true, new: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    item = await AuthThrottle.findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { new: true });
  }
  if (!item || item.count > limit) throw new ApiError(429, 'Too many attempts. Please wait before trying again.');
}
export const authLimit = asyncHandler(async (req, _res, next) => {
  await consumeLimit(`auth-ip:${req.ip}`, 40, 15 * 60 * 1000);
  next();
});
