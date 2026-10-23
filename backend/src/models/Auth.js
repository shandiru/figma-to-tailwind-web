import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
  _id: String,
  name: String,
  email: { type: String, required: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['user', 'superadmin'], default: 'user' },
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
const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true, maxlength: 80 },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  actorEmail: { type: String, required: true, maxlength: 254 },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  targetEmail: { type: String, maxlength: 254, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
auditLogSchema.index({ createdAt: -1 });

export const AuthChallenge = mongoose.model('AuthChallenge', challengeSchema);
export const AuthSession = mongoose.model('AuthSession', sessionSchema);
export const AuthThrottle = mongoose.model('AuthThrottle', throttleSchema);
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
