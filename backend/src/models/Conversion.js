import mongoose from 'mongoose';

const conversionSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Untitled page', trim: true },
    status: { type: String, enum: ['processing', 'done', 'failed'], default: 'processing' },
    zipPath: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Conversion = mongoose.model('Conversion', conversionSchema);
