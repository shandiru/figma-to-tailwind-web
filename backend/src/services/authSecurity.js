import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

const derive = promisify(scrypt);
const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
export const opaqueToken = () => randomBytes(32).toString('hex');
export const tokenHash = value => createHash('sha256').update(value).digest('hex');
export const newOtp = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function otpHash(challengeId, code) {
  if (!env.authSecret || env.authSecret.length < 32) throw new ApiError(503, 'Account verification is temporarily unavailable.');
  return createHmac('sha256', env.authSecret).update(`${challengeId}:${code}`).digest('hex');
}
export function normalizeEmail(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'Enter a valid email address.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address.');
  return email;
}
export function validatePassword(value) {
  if (typeof value !== 'string' || [...value].length < 15 || value.length > 128) throw new ApiError(400, 'Use a password with 15 to 128 characters. Spaces are welcome.');
  return value;
}
export async function hashPassword(value) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(value, salt, 64, SCRYPT);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function checkPassword(value, stored) {
  if (typeof value !== 'string' || value.length > 128 || typeof stored !== 'string') return false;
  const [scheme, salt, digest] = stored.split(':');
  if (scheme !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(digest)) return false;
  const actual = await derive(value, salt, 64, SCRYPT);
  return timingSafeEqual(actual, Buffer.from(digest, 'hex'));
}
export const publicUser = user => ({ id: String(user._id), name: user.name, email: user.email, role: user.role || 'user' });
