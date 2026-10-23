import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseConnector, database } from '../src/config/db.js';
import { AuthThrottle } from '../src/models/Auth.js';
import app from '../src/app.js';

test('cold-start requests share one Mongo connection and wait for security indexes', async () => {
  let open, releaseIndexes, connections = 0, indexCalls = 0;
  const connectionWait = new Promise(resolve => { open = resolve; });
  const indexWait = new Promise(resolve => { releaseIndexes = resolve; });
  const client = { connection: { readyState: 0 }, connect: async (_uri, options) => {
    connections++;
    assert.equal(options.bufferCommands, false);
    assert.equal(options.serverSelectionTimeoutMS, 8000);
    client.connection.readyState = 2;
    await connectionWait;
    client.connection.readyState = 1;
  } };
  const connect = createDatabaseConnector({ client, getUri: () => 'mongodb://test.invalid/test', models: [{ createIndexes: async () => { indexCalls++; await indexWait; } }] });
  let completed = 0;
  const requests = [connect(), connect(), connect()].map(promise => promise.then(() => completed++));
  await Promise.resolve();
  assert.equal(connections, 1); assert.equal(indexCalls, 0); assert.equal(completed, 0);
  open();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(indexCalls, 1); assert.equal(completed, 0);
  releaseIndexes(); await Promise.all(requests);
  assert.equal(completed, 3);
  await connect();
  assert.equal(connections, 1); assert.equal(indexCalls, 1);
});

test('failed connections can retry and disconnected warm instances reconnect', async () => {
  let calls = 0;
  const client = { connection: { readyState: 0 }, connect: async () => {
    if (++calls === 1) throw new Error('Temporary connection failure');
    client.connection.readyState = 1;
  } };
  const connect = createDatabaseConnector({ client, models: [], getUri: () => 'mongodb://test.invalid/test' });
  await assert.rejects(connect(), /Temporary connection failure/);
  await connect(); assert.equal(calls, 2);
  client.connection.readyState = 0;
  await connect(); assert.equal(calls, 3);
});

test('failed index initialization retries and missing URI never opens a connection', async () => {
  let indexes = 0;
  const client = { connection: { readyState: 1 }, connect: () => assert.fail('No new connection expected') };
  const connect = createDatabaseConnector({ client, getUri: () => 'mongodb://test.invalid/test', models: [{ createIndexes: async () => { if (++indexes === 1) throw new Error('Temporary index failure'); } }] });
  await assert.rejects(connect(), /Temporary index failure/);
  await connect(); assert.equal(indexes, 2);
  const unconfigured = createDatabaseConnector({ client, getUri: () => '', models: [] });
  await assert.rejects(unconfigured(), error => error.code === 'MONGO_URI_MISSING');
});

test('exported app waits for Mongo readiness and returns sanitized 503 before any auth query', async t => {
  let entered, fail;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise((_resolve, reject) => { fail = reject; });
  t.mock.method(database, 'connect', () => { entered(); return blocked; });
  let queries = 0;
  t.mock.method(AuthThrottle, 'findOneAndUpdate', () => { queries++; assert.fail('Auth query ran without a connection'); });
  const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'designer@example.com', password: 'a valid test passphrase' }) });
  await started;
  assert.equal(queries, 0);
  fail(Object.assign(new Error('mongodb://private-user:private-password@test.invalid/test'), { code: 'TEST_UNAVAILABLE' }));
  const response = await request;
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(queries, 0);
  assert.ok(!(await response.text()).includes('private-password'));
  assert.ok(!JSON.stringify(logs).includes('private-password'));
  t.mock.method(database, 'connect', async () => {});
  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
});
