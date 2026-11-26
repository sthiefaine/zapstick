import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { openAuthStore, sessionKey } from '../src/auth.mjs';
import { pairInPrivateTerminal } from '../src/pair.mjs';

const BufferJSON = {
  replacer(_key, value) { return value instanceof Uint8Array ? { type: 'Buffer', data: [...value] } : value; },
  reviver(_key, value) { return value?.type === 'Buffer' && Array.isArray(value.data) ? Buffer.from(value.data) : value; }
};
const proto = { Message: { AppStateSyncKeyData: { fromObject(value) { return { ...value, restoredProto: true }; } } } };
function fixture(t) {
  const authDir = mkdtempSync(join(tmpdir(), 'zapstick-auth-test-'));
  const authKey = randomBytes(32).toString('base64url');
  const options = { authDir, authKey, BufferJSON, proto, initAuthCreds: () => ({ registered: false, secret: 'credential-fixture-secret', noiseKey: { private: Buffer.from('private-noise-key') } }) };
  const opened = new Set();
  t.after(() => { for (const store of opened) store.close(); rmSync(authDir, { recursive: true, force: true }); });
  return { ...options, open(override = {}) { const store = openAuthStore({ ...options, ...override }); opened.add(store); return store; } };
}

test('auth key is exactly a canonical 256-bit key', () => {
  const key = randomBytes(32);
  assert.deepEqual(sessionKey(key), key);
  assert.deepEqual(sessionKey(key.toString('base64url')), key);
  for (const invalid of ['', 'key', Buffer.alloc(31), 'A'.repeat(42), 'A'.repeat(44)]) assert.throws(() => sessionKey(invalid));
});

test('credentials and Signal keys persist together, preserving binary values', async t => {
  const f = fixture(t), store = f.open();
  await store.saveCreds({ registered: true, me: { id: '33000000000@s.whatsapp.net' } });
  await store.state.keys.set({ session: { '33000000001.0': { key: Buffer.from([1, 2, 255]) } }, 'app-state-sync-key': { abc: { keyData: Buffer.from([9]) } } });
  store.close();
  const resumed = f.open();
  assert.equal(resumed.state.creds.registered, true);
  assert.deepEqual(resumed.state.creds.noiseKey.private, Buffer.from('private-noise-key'));
  assert.deepEqual((await resumed.state.keys.get('session', ['33000000001.0']))['33000000001.0'].key, Buffer.from([1, 2, 255]));
  assert.equal((await resumed.state.keys.get('app-state-sync-key', ['abc'])).abc.restoredProto, true);
});

test('session contents and Signal addresses do not occur in the SQLite files', async t => {
  const f = fixture(t), store = f.open();
  await store.state.keys.set({ session: { '33987654321.0': { secret: 'signal-fixture-secret' } } });
  for (const filename of readdirSync(f.authDir)) {
    const bytes = readFileSync(join(f.authDir, filename));
    for (const secret of ['credential-fixture-secret', 'private-noise-key', '33987654321', 'signal-fixture-secret']) assert.equal(bytes.includes(Buffer.from(secret)), false, filename);
  }
  assert.equal(statSync(f.authDir).mode & 0o777, 0o700);
  assert.equal(statSync(join(f.authDir, 'auth.sqlite')).mode & 0o777, 0o600);
});

test('a live auth session refuses another owner; close releases the SQLite lock', t => {
  const f = fixture(t), store = f.open();
  assert.throws(() => f.open(), { code: 'session_in_use' });
  store.close();
  const next = f.open();
  assert.equal(next.state.creds.secret, 'credential-fixture-secret');
});

test('wrong key fails closed without overwriting the previous identity', t => {
  const f = fixture(t), store = f.open();
  store.close();
  assert.throws(() => f.open({ authKey: randomBytes(32).toString('base64url') }), { code: 'invalid_session_key' });
  assert.equal(f.open().state.creds.secret, 'credential-fixture-secret');
});

test('a failed key batch rolls back all writes and deletion is durable', async t => {
  const f = fixture(t), store = f.open(), circular = {};
  circular.self = circular;
  await assert.rejects(store.state.keys.set({ session: { first: { secret: 'first' }, broken: circular } }));
  assert.equal((await store.state.keys.get('session', ['first'])).first, undefined);
  await store.state.keys.set({ session: { live: { key: Buffer.from([7]) } } });
  await store.state.keys.set({ session: { live: null } });
  store.close();
  assert.equal((await f.open().state.keys.get('session', ['live'])).live, undefined);
});

test('tampered credentials cannot be decoded as an empty session', t => {
  const f = fixture(t), store = f.open();
  store.close();
  const db = new DatabaseSync(join(f.authDir, 'auth.sqlite'));
  db.prepare("UPDATE auth SET value=? WHERE family='creds'").run(Buffer.alloc(40));
  db.close();
  assert.throws(() => f.open(), { code: 'invalid_session_key' });
});

test('pairing refuses pipes and non-interactive terminals before loading the SDK', async () => {
  await assert.rejects(pairInPrivateTerminal({ input: { isTTY: false }, output: { isTTY: false }, errorOutput: { isTTY: false } }), /private interactive/);
});
