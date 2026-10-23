import assert from 'node:assert/strict';
import { test } from 'node:test';
import app from '../src/app.js';
import { env } from '../src/config/env.js';
import { emailService } from '../src/services/emailService.js';
import { checkPassword, hashPassword, otpHash, tokenHash } from '../src/services/authSecurity.js';
import { Conversion } from '../src/models/Conversion.js';
import { authStore } from './helpers/authStore.js';

async function fixture(t) {
  const store = authStore(t.mock);
  const previousSecret = env.authSecret;
  env.authSecret = 'test-secret-for-isolated-authentication-tests-only';
  t.after(() => { env.authSecret = previousSecret; });
  const messages = [];
  t.mock.method(emailService, 'sendVerification', async (email, code) => { messages.push({ email, code }); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (action, data, headers = {}) => fetch(`${base}/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  const register = async () => {
    const response = await post('register', { name: 'Test Designer', email: 'Designer@example.com', password: 'my very long secure passphrase' });
    assert.equal(response.status, 202, await response.clone().text());
    return response.json();
  };
  return { store, messages, base, post, register };
}

test('password hashing uses independent salts and checks the complete password', async () => {
  const password = 'my very long secure passphrase';
  const a = await hashPassword(password); const b = await hashPassword(password);
  assert.notEqual(a, b); assert.ok(!a.includes(password));
  assert.equal(await checkPassword(password, a), true);
  assert.equal(await checkPassword(`${password}!`, a), false);
  assert.equal(await checkPassword(password, 'broken'), false);
});

test('registration, OTP verification, cookie sessions, CSRF, history privacy, and logout work together', async t => {
  const f = await fixture(t);
  const signup = await f.register();
  assert.equal(f.store.users.size, 0, 'Unverified registration cannot become a user');
  const challenge = f.store.challenges.get(signup.challengeId);
  assert.equal(challenge.email, 'designer@example.com');
  assert.notEqual(challenge.otpHash, f.messages[0].code);
  assert.ok(!JSON.stringify(signup).includes('password'));
  assert.equal((await fetch(`${f.base}/history`)).status, 401);
  const wrong = f.messages[0].code === '000000' ? '111111' : '000000';
  assert.equal((await f.post('verify-email', { challengeId: signup.challengeId, code: wrong })).status, 400);
  const verified = await f.post('verify-email', { challengeId: signup.challengeId, code: f.messages[0].code });
  assert.equal(verified.status, 200, await verified.clone().text());
  const cookieHeader = verified.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/); assert.match(cookieHeader, /SameSite=Lax/);
  const cookie = cookieHeader.split(';')[0];
  const session = await verified.json();
  assert.equal(session.user.email, 'designer@example.com');
  assert.ok(!('passwordHash' in session.user));
  assert.equal(f.store.challenges.size, 0);
  assert.equal((await f.post('verify-email', { challengeId: signup.challengeId, code: f.messages[0].code })).status, 400, 'OTP is single use');
  const token = cookie.split('=')[1];
  assert.ok(f.store.sessions.has(tokenHash(token))); assert.ok(!f.store.sessions.has(token));
  const me = await fetch(`${f.base}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200); assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.equal((await f.post('logout', {}, { Cookie: cookie })).status, 403, 'CSRF is required');
  assert.equal((await f.post('logout', {}, { Cookie: cookie, 'X-CSRF-Token': session.csrfToken, Origin: 'https://untrusted.example' })).status, 403);
  let historyFilter;
  t.mock.method(Conversion, 'find', filter => { historyFilter = filter; return { sort: () => ({ limit: () => ({ select: async () => [] }) }) }; });
  assert.equal((await fetch(`${f.base}/history`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal(String(historyFilter.userId), session.user.id);
  let downloadFilter;
  t.mock.method(Conversion, 'findOne', async filter => { downloadFilter = filter; return null; });
  assert.equal((await fetch(`${f.base}/history/507f1f77bcf86cd799439099/download`, { headers: { Cookie: cookie } })).status, 404);
  assert.equal(String(downloadFilter.userId), session.user.id);
  assert.equal((await f.post('logout', {}, { Cookie: cookie, 'X-CSRF-Token': session.csrfToken })).status, 204);
  assert.equal((await fetch(`${f.base}/auth/me`, { headers: { Cookie: cookie } })).status, 401);
});

test('expired OTPs and OTPs after five wrong attempts cannot create accounts', async t => {
  const f = await fixture(t); const signup = await f.register();
  const challenge = f.store.challenges.get(signup.challengeId);
  const code = f.messages[0].code;
  const wrong = code === '999999' ? '888888' : '999999';
  for (let i = 0; i < 5; i++) assert.equal((await f.post('verify-email', { challengeId: signup.challengeId, code: wrong })).status, 400);
  assert.equal((await f.post('verify-email', { challengeId: signup.challengeId, code })).status, 400);
  challenge.attempts = 0; challenge.expiresAt = new Date(Date.now() - 1);
  assert.equal((await f.post('verify-email', { challengeId: signup.challengeId, code })).status, 400);
  assert.equal(f.store.users.size, 0);
});

test('an email can register only once, including uppercase and surrounding spaces', async t => {
  const f = await fixture(t); const signup = await f.register();
  const verified = await f.post('verify-email', { challengeId: signup.challengeId, code: f.messages[0].code });
  assert.equal(verified.status, 200);
  const originalHash = [...f.store.users.values()][0].passwordHash;
  for (const email of ['designer@example.com', '  DESIGNER@EXAMPLE.COM  ']) {
    const response = await f.post('register', { name: 'Another name', email, password: 'a different long passphrase' });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /already registered/);
  }
  assert.equal(f.messages.length, 1, 'Duplicate signup must not send another verification email');
  assert.equal(f.store.users.size, 1);
  assert.equal([...f.store.users.values()][0].passwordHash, originalHash, 'Existing credentials remain intact');
});

test('resend is throttled, invalidates the old code, and never exposes OTPs in HTTP responses', async t => {
  const f = await fixture(t); const signup = await f.register();
  assert.equal((await f.post('resend-code', { challengeId: signup.challengeId })).status, 429);
  const challenge = f.store.challenges.get(signup.challengeId);
  challenge.resendAfter = new Date(Date.now() - 1); f.store.limits.clear();
  const sent = await f.post('resend-code', { challengeId: signup.challengeId });
  assert.equal(sent.status, 200);
  assert.ok(!Object.hasOwn(await sent.json(), 'code'));
  assert.equal(challenge.otpHash, otpHash(signup.challengeId, f.messages[1].code));
  assert.equal((await f.post('resend-code', { challengeId: signup.challengeId })).status, 429);
});

test('sign-in rejects unverified or incorrect credentials and expires old sessions', async t => {
  const f = await fixture(t); const signup = await f.register();
  const credentials = { email: 'designer@example.com', password: 'my very long secure passphrase' };
  const before = await f.post('login', credentials);
  assert.equal(before.status, 401);
  const verified = await f.post('verify-email', { challengeId: signup.challengeId, code: f.messages[0].code });
  const cookie = verified.headers.get('set-cookie').split(';')[0];
  const bad = await f.post('login', { ...credentials, password: 'incorrect password' });
  assert.equal(bad.status, 401); assert.deepEqual(await bad.json(), await before.json());
  const good = await f.post('login', credentials, { Cookie: cookie });
  assert.equal(good.status, 200);
  assert.notEqual(good.headers.get('set-cookie').split(';')[0], cookie);
  assert.equal((await fetch(`${f.base}/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  const session = [...f.store.sessions.values()][0]; session.expiresAt = new Date(Date.now() - 1);
  assert.equal((await fetch(`${f.base}/auth/me`, { headers: { Cookie: good.headers.get('set-cookie').split(';')[0] } })).status, 401);
});

test('invalid input, SMTP failure, origin checks, and durable limits fail closed', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('register', { email: { $ne: null } })).status, 400);
  assert.equal((await f.post('register', { name: 'Test', email: 'test@example.com', password: 'short' })).status, 400);
  assert.equal((await f.post('login', { email: 'test@example.com', password: 'anything' }, { Origin: 'https://untrusted.example' })).status, 403);
  t.mock.method(emailService, 'sendVerification', async () => { throw Object.assign(new Error('Email temporarily unavailable'), { status: 503 }); });
  const response = await f.post('register', { name: 'Test', email: 'test@example.com', password: 'my very long secure passphrase' });
  assert.equal(response.status, 503); assert.equal(f.store.challenges.size, 0);
  for (const value of f.store.limits.values()) value.count = 100;
  assert.equal((await f.post('login', { email: 'test@example.com', password: 'anything' })).status, 429);
});
