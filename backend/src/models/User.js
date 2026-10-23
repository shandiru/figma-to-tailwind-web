import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  verifiedAt: { type: Date, required: true },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
