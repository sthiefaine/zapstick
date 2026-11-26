import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export function sessionKey(value) {
  if (Buffer.isBuffer(value) && value.length === 32) return Buffer.from(value);
  if (typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)) {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length === 32 && bytes.toString('base64url') === value) return bytes;
  }
  throw new Error('WHATSAPP_AUTH_KEY must be a 32-byte base64url key.');
}

function assertRegularFile(path) {
  if (existsSync(path) && !lstatSync(path).isFile()) throw new Error('Invalid WhatsApp session file.');
}

/** A live SQLite write lock, unlike a PID file, is released by the OS after a
 * crash and works across container PID namespaces on the same local volume. */
function acquireSessionLock(directory) {
  const path = join(directory, 'auth-lock.sqlite');
  assertRegularFile(path);
  let lock;
  try {
    lock = new DatabaseSync(path);
    chmodSync(path, 0o600);
    lock.exec('PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner_lock (id INTEGER PRIMARY KEY);');
    return lock;
  } catch {
    try { lock?.close(); } catch {}
    const error = new Error('Another process owns this WhatsApp session.');
    error.code = 'session_in_use';
    throw error;
  }
}

/** Transactional credentials and Signal keys. Dependencies are injected so the
 * store can be tested without importing or connecting a WhatsApp socket. */
export function openAuthStore({ authDir, authKey, initAuthCreds, BufferJSON, proto }) {
  const key = sessionKey(authKey);
  if (typeof authDir !== 'string' || !authDir) throw new Error('WhatsApp auth directory is required.');
  mkdirSync(authDir, { recursive: true, mode: 0o700 });
  if (!lstatSync(authDir).isDirectory() || lstatSync(authDir).isSymbolicLink()) throw new Error('Invalid WhatsApp auth directory.');
  chmodSync(authDir, 0o700);
  const lock = acquireSessionLock(authDir);
  let database;
  let closed = false;
  try {
    const path = join(authDir, 'auth.sqlite');
    assertRegularFile(path);
    database = new DatabaseSync(path);
    chmodSync(path, 0o600);
    database.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS auth (family TEXT NOT NULL, key_id TEXT NOT NULL, value BLOB NOT NULL, PRIMARY KEY(family,key_id));');
    const read = database.prepare('SELECT value FROM auth WHERE family=? AND key_id=?');
    const write = database.prepare('INSERT INTO auth(family,key_id,value) VALUES(?,?,?) ON CONFLICT(family,key_id) DO UPDATE SET value=excluded.value');
    const remove = database.prepare('DELETE FROM auth WHERE family=? AND key_id=?');
    const address = (type, id) => createHmac('sha256', key).update(JSON.stringify([type, id])).digest('hex');
    const assertOpen = () => { if (closed) throw new Error('WhatsApp session store is closed.'); };
    function seal(value, aad) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(aad));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value, BufferJSON.replacer)), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    }
    function unseal(value, aad) {
      try {
        const bytes = Buffer.from(value);
        if (bytes.length < 29) throw new Error('Invalid ciphertext.');
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from(aad));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'), BufferJSON.reviver);
      } catch {
        const error = new Error('Unable to decrypt the WhatsApp session. Check the configured key.');
        error.code = 'invalid_session_key';
        throw error;
      }
    }
    const credentialId = address('creds', 'current');
    const saved = read.get('creds', credentialId);
    // A wrong key must fail, never silently create a second identity over the
    // first one. The index is deliberately HMACed to hide Signal addresses.
    if (!saved && database.prepare("SELECT 1 FROM auth WHERE family='creds' LIMIT 1").get()) {
      const error = new Error('Unable to decrypt the WhatsApp session. Check the configured key.');
      error.code = 'invalid_session_key';
      throw error;
    }
    const creds = saved ? unseal(saved.value, credentialId) : initAuthCreds();
    if (!saved) write.run('creds', credentialId, seal(creds, credentialId));
    function transaction(work) {
      assertOpen();
      database.exec('BEGIN IMMEDIATE');
      try { work(); database.exec('COMMIT'); }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    }
    return {
      state: {
        creds,
        keys: {
          async get(type, ids) {
            assertOpen();
            const result = Object.create(null);
            for (const id of ids) {
              const index = address(type, id), row = read.get('keys', index);
              if (!row) continue;
              let value = unseal(row.value, index);
              if (type === 'app-state-sync-key') value = proto.Message.AppStateSyncKeyData.fromObject(value);
              result[id] = value;
            }
            return result;
          },
          async set(data) {
            transaction(() => {
              for (const [type, entries] of Object.entries(data)) for (const [id, value] of Object.entries(entries ?? {})) {
                const index = address(type, id);
                if (value === null || value === undefined) remove.run('keys', index);
                else write.run('keys', index, seal(value, index));
              }
            });
          },
          async clear() { transaction(() => database.exec("DELETE FROM auth WHERE family='keys'")); }
        }
      },
      async saveCreds(update) {
        assertOpen();
        if (update) Object.assign(creds, update);
        transaction(() => write.run('creds', credentialId, seal(creds, credentialId)));
      },
      close() {
        if (closed) return;
        closed = true;
        try { database.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } finally {
          database.close();
          try { lock.exec('ROLLBACK'); } finally { lock.close(); key.fill(0); }
        }
      }
    };
  } catch (error) {
    try { database?.close(); } catch {}
    try { lock.exec('ROLLBACK'); lock.close(); } catch {}
    key.fill(0);
    throw error;
  }
}
