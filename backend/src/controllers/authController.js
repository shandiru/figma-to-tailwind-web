import { User } from '../models/User.js';
import { AuthChallenge, AuthSession } from '../models/Auth.js';
import { emailService } from '../services/emailService.js';
import { checkPassword, hashPassword, newOtp, normalizeEmail, opaqueToken, otpHash, publicUser, safeEqual, tokenHash, validatePassword } from '../services/authSecurity.js';
import { COOKIE_NAME, SESSION_MS, consumeLimit, cookieOptions, sessionToken } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

const TEN_MINUTES = 10 * 60 * 1000;
const sendLimits = async email => {
  await consumeLimit(`email-minute:${email}`, 1, 60000);
  await consumeLimit(`email-hour:${email}`, 5, 60 * 60 * 1000);
};
async function startSession(req, res, user) {
  const token = opaqueToken();
  const csrfToken = opaqueToken();
  const previous = sessionToken(req);
  if (previous && /^[a-f0-9]{64}$/.test(previous)) await AuthSession.deleteOne({ _id: tokenHash(previous) });
  await AuthSession.create({ _id: tokenHash(token), userId: user._id, csrfToken, expiresAt: new Date(Date.now() + SESSION_MS) });
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.setHeader('Cache-Control', 'no-store');
  res.json({ user: publicUser(user), csrfToken });
}
export const register = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (name.length < 2 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) throw new ApiError(400, 'Enter your name (2 to 80 characters).');
  const password = validatePassword(req.body?.password);
  if (await User.exists({ email })) throw new ApiError(409, 'This email is already registered. Please sign in.');
  await sendLimits(email);
  const passwordHash = await hashPassword(password);
  const challengeId = opaqueToken();
  const code = newOtp();
  await AuthChallenge.create({ _id: challengeId, name, email, passwordHash, otpHash: otpHash(challengeId, code), attempts: 0, resendAfter: new Date(Date.now() + 60000), expiresAt: new Date(Date.now() + TEN_MINUTES) });
  try { await emailService.sendVerification(email, code); }
  catch (error) { await AuthChallenge.deleteOne({ _id: challengeId }); throw error; }
  res.status(202).json({ challengeId, resendAfter: 60, message: 'A verification code has been sent to your email.' });
});
export const verifyEmail = asyncHandler(async (req, res) => {
  const { challengeId, code } = req.body || {};
  if (typeof challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(challengeId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new ApiError(400, 'Enter the six-digit code from your email.');
  const now = new Date();
  const challenge = await AuthChallenge.findOneAndUpdate({ _id: challengeId, expiresAt: { $gt: now }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true }).select('+otpHash +passwordHash');
  if (!challenge || !safeEqual(challenge.otpHash, otpHash(challengeId, code))) throw new ApiError(400, 'This code is incorrect or expired. Request a new code and try again.');
  // Atomic consumption prevents concurrent OTP replay, even across instances.
  const consumed = await AuthChallenge.findOneAndDelete({ _id: challengeId, otpHash: challenge.otpHash, expiresAt: { $gt: new Date() } });
  if (!consumed) throw new ApiError(400, 'This code has already been used. Please sign in.');
  let user;
  try { user = await User.create({ name: challenge.name, email: challenge.email, passwordHash: challenge.passwordHash, verifiedAt: new Date() }); }
  catch (error) { if (error.code === 11000) throw new ApiError(409, 'Unable to create this account. Please sign in instead.'); throw error; }
  await startSession(req, res, user);
});
export const resendCode = asyncHandler(async (req, res) => {
  const id = req.body?.challengeId;
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new ApiError(400, 'Start registration again to request a code.');
  const challenge = await AuthChallenge.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!challenge) throw new ApiError(400, 'Verification expired. Please start registration again.');
  await sendLimits(challenge.email);
  const code = newOtp();
  const hash = otpHash(id, code);
  const updated = await AuthChallenge.findOneAndUpdate({ _id: id, resendAfter: { $lte: new Date() }, expiresAt: { $gt: new Date() } }, { $set: { otpHash: hash, attempts: 0, expiresAt: new Date(Date.now() + TEN_MINUTES), resendAfter: new Date(Date.now() + 60000) } });
  if (!updated) throw new ApiError(429, 'Please wait one minute before requesting another code.');
  await emailService.sendVerification(challenge.email, code);
  res.json({ resendAfter: 60, message: 'A new verification code has been sent.' });
});
let dummyPassword;
export const login = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length > 128) throw new ApiError(401, 'Email or password is incorrect.');
  await consumeLimit(`login-email:${email}`, 10, 15 * 60 * 1000);
  const user = await User.findOne({ email }).select('+passwordHash');
  dummyPassword ||= hashPassword(opaqueToken());
  const valid = await checkPassword(password, user?.passwordHash || await dummyPassword);
  if (!user?.verifiedAt || !valid) throw new ApiError(401, 'Email or password is incorrect.');
  await startSession(req, res, user);
});
export const currentUser = (req, res) => res.json({ user: publicUser(req.user), csrfToken: req.authSession.csrfToken });
export const logout = asyncHandler(async (req, res) => {
  await AuthSession.deleteOne({ _id: req.authSession._id });
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
  res.status(204).end();
});
