import mongoose from 'mongoose';
import { env } from './env.js';
import { User } from '../models/User.js';
import { AuthChallenge, AuthSession, AuthThrottle } from '../models/Auth.js';

export async function connectDB() {
  if (!env.mongoUri) throw new Error('MONGO_URI is not set');
  await mongoose.connect(env.mongoUri);
  await Promise.all([User.init(), AuthChallenge.init(), AuthSession.init(), AuthThrottle.init()]);
  console.log('MongoDB connected');
}
