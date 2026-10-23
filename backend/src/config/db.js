import mongoose from 'mongoose';
import { env } from './env.js';
import { User } from '../models/User.js';
import { AuthChallenge, AuthSession, AuthThrottle } from '../models/Auth.js';

export function createDatabaseConnector({ client = mongoose, models = [User, AuthChallenge, AuthSession, AuthThrottle], getUri = () => env.mongoUri } = {}) {
  let connecting;
  let indexes;
  return async function ensureConnected() {
    const uri = getUri();
    if (!uri) throw Object.assign(new Error('MONGO_URI is not configured'), { code: 'MONGO_URI_MISSING' });
    if (client.connection.readyState !== 1) {
      // Concurrent cold-start requests share one connection attempt. Clear failed
      // attempts so a later request can recover after a temporary outage.
      if (!connecting) {
        connecting = Promise.resolve().then(() => client.connect(uri, {
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
          maxPoolSize: 5,
          minPoolSize: 0,
          maxIdleTimeMS: 60000,
          bufferCommands: false,
          autoCreate: false,
          autoIndex: false,
        })).finally(() => { connecting = undefined; });
      }
      await connecting;
    }
    // Explicit, idempotent index creation protects unique emails and TTL expiry.
    // Unlike Model.init(), a rejected attempt can be retried after reconnecting.
    if (!indexes) {
      indexes = Promise.all(models.map(model => model.createIndexes())).catch(error => {
        indexes = undefined;
        throw error;
      });
    }
    await indexes;
    return client.connection;
  };
}

export const connectDB = createDatabaseConnector();
export const database = { connect: connectDB };
