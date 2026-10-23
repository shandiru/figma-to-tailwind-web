import { AuthSession } from '../../src/models/Auth.js';
import { User } from '../../src/models/User.js';
import { tokenHash } from '../../src/services/authSecurity.js';

export const testToken = 'a'.repeat(64);
export const testCsrf = 'b'.repeat(64);
export const testUser = { _id: '507f1f77bcf86cd799439011', name: 'Test designer', email: 'designer@example.com', verifiedAt: new Date() };
export function authorize(t) {
  t.mock.method(AuthSession, 'findOne', async query => query._id === tokenHash(testToken) ? { _id: query._id, userId: testUser._id, csrfToken: testCsrf } : null);
  t.mock.method(User, 'findById', async () => testUser);
  return (url, options = {}) => fetch(url, { ...options, headers: { ...options.headers, Cookie: `frame_session=${testToken}`, 'X-CSRF-Token': testCsrf } });
}
