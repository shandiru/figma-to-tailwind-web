import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, immutable: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  verifiedAt: { type: Date, required: true },
  role: { type: String, enum: ['user', 'superadmin'], default: 'user', required: true },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
