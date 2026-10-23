import { AuthChallenge, AuthSession, AuthThrottle } from '../../src/models/Auth.js';
import { User } from '../../src/models/User.js';
import { database } from '../../src/config/db.js';

// Isolated Mongo adapter for HTTP tests; no production database or email account.
export function authStore(mocks) {
  mocks.method(database, 'connect', async () => {});
  const users = new Map(), challenges = new Map(), sessions = new Map(), limits = new Map();
  const match = (doc, query) => Object.entries(query).every(([key, value]) => {
    const current = doc[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$gt' in value && !(current > value.$gt)) return false;
      if ('$lt' in value && !(current < value.$lt)) return false;
      if ('$lte' in value && !(current <= value.$lte)) return false;
      return true;
    }
    return String(current) === String(value);
  });
  const queryResult = value => ({ select: () => Promise.resolve(value), then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });
  const install = (model, store) => {
    mocks.method(model, 'create', async doc => {
      if (model === User && [...store.values()].some(user => user.email === doc.email)) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      const item = { ...doc, _id: doc._id || `507f1f77bcf86cd7994390${String(store.size + 11).padStart(2, '0')}` };
      store.set(String(item._id), item); return item;
    });
    mocks.method(model, 'findOne', query => queryResult([...store.values()].find(doc => match(doc, query)) || null));
    mocks.method(model, 'findOneAndUpdate', (query, update, options = {}) => {
      let item = [...store.values()].find(doc => match(doc, query));
      if (!item && options.upsert) { item = { ...query, ...update.$setOnInsert }; store.set(String(item._id), item); }
      if (!item) return queryResult(null);
      for (const [key, value] of Object.entries(update.$inc || {})) item[key] = (item[key] || 0) + value;
      Object.assign(item, update.$set);
      return queryResult({ ...item });
    });
    mocks.method(model, 'deleteOne', async query => {
      const item = [...store.values()].find(doc => match(doc, query));
      if (item) store.delete(String(item._id));
      return { deletedCount: item ? 1 : 0 };
    });
    mocks.method(model, 'findOneAndDelete', async query => {
      const item = [...store.values()].find(doc => match(doc, query));
      if (item) store.delete(String(item._id));
      return item || null;
    });
  };
  install(User, users); install(AuthChallenge, challenges); install(AuthSession, sessions); install(AuthThrottle, limits);
  mocks.method(User, 'findById', id => queryResult(users.get(String(id)) || null));
  mocks.method(User, 'exists', async query => [...users.values()].some(doc => match(doc, query)));
  return { users, challenges, sessions, limits };
}
