import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
  _id: String,
  name: String,
  email: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false },
  otpHash: { type: String, required: true, select: false },
  attempts: { type: Number, default: 0 },
  resendAfter: Date,
  expiresAt: { type: Date, required: true, expires: 0 },
});
const sessionSchema = new mongoose.Schema({
  _id: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  csrfToken: { type: String, required: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});
const throttleSchema = new mongoose.Schema({
  _id: String,
  count: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export const AuthChallenge = mongoose.model('AuthChallenge', challengeSchema);
export const AuthSession = mongoose.model('AuthSession', sessionSchema);
export const AuthThrottle = mongoose.model('AuthThrottle', throttleSchema);
