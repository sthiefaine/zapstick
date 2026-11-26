import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, renameSync, rmSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { BridgeError, LIMITS, LOCALES, capability, equalSecret } from './config.mjs';

const ACTIVE = ['receiving', 'awaiting_message', 'queued', 'processing', 'sending'];
const TERMINAL = ['accepted', 'delivered', 'delivery_unknown', 'failed', 'cancelled', 'expired'];

function acquireTransferLock(dir) {
  let lock;
  try {
    const filename = path.join(dir, 'transfers-lock.sqlite');
    lock = new DatabaseSync(filename); chmodSync(filename, 0o600);
    lock.exec('PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner_lock (id INTEGER PRIMARY KEY);');
    return lock;
  } catch {
    try { lock?.close(); } catch {}
    throw new BridgeError('storage_in_use', 503);
  }
}

/** One process owns this database. All claims and state transitions are synchronous transactions. */
export class BridgeStore {
  constructor({ dir, key, botNumber, clock = Date.now, limits = {} }) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new BridgeError('invalid_transfer_key', 500);
    this.dir = path.resolve(dir); this.mediaDir = path.join(this.dir, 'media');
    this.key = Buffer.from(key); this.botNumber = botNumber; this.clock = clock; this.limits = { ...LIMITS, ...limits };
    mkdirSync(this.mediaDir, { recursive: true, mode: 0o700 }); chmodSync(this.dir, 0o700); chmodSync(this.mediaDir, 0o700);
    // Lock before opening/migrating jobs or interpreting interrupted sends.
    // The WhatsApp session lock is acquired later and cannot protect recovery.
    this.lock = acquireTransferLock(this.dir);
    try {
    this.db = new DatabaseSync(path.join(this.dir, 'transfers.sqlite'));
    chmodSync(path.join(this.dir, 'transfers.sqlite'), 0o600);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY, receipt_hash TEXT NOT NULL, content_hash TEXT NOT NULL,
        state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, finished_at INTEGER,
        locale TEXT NOT NULL, kind TEXT NOT NULL, duration REAL NOT NULL, has_sound INTEGER NOT NULL,
        claim_hash TEXT UNIQUE, claim_cipher TEXT, recipient_cipher TEXT,
        message_hash TEXT UNIQUE, error TEXT, reserved_bytes INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS store_config (name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inbound_events (event_hash TEXT PRIMARY KEY, transfer_id TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE, sender_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS inbound_sender_created ON inbound_events(sender_hash,created_at);
      CREATE INDEX IF NOT EXISTS transfers_state_created ON transfers(state,created_at);
      CREATE INDEX IF NOT EXISTS transfers_expiry ON transfers(expires_at);`);
    const verifier = this.digest('key-check', 'zapstick-transfers-v1');
    const previousKey = this.db.prepare("SELECT value FROM store_config WHERE name='key_check'").get();
    if (previousKey && !equalSecret(previousKey.value, verifier)) { this.db.close(); throw new BridgeError('invalid_transfer_key', 500); }
    this.db.prepare("INSERT OR IGNORE INTO store_config VALUES('key_check',?)").run(verifier);
    // A sending job may already have reached WhatsApp. Never repeat it automatically.
    for (const row of this.db.prepare("SELECT * FROM transfers WHERE state IN ('receiving','processing','sending')").all()) {
      if (row.state === 'sending') this.finish(row.id, 'delivery_unknown', { error: 'delivery_unknown' });
      else if (row.state === 'processing' && row.expires_at > this.clock()) this.db.prepare("UPDATE transfers SET state='queued' WHERE id=?").run(row.id);
      else this.finish(row.id, row.expires_at <= this.clock() ? 'expired' : 'failed', { error: 'interrupted' });
    }
    this.sweep();
    const ids = new Set(this.db.prepare(`SELECT id FROM transfers WHERE state IN (${ACTIVE.map(() => '?').join(',')})`).all(...ACTIVE).map(row => row.id));
    for (const item of readdirSync(this.mediaDir, { withFileTypes: true })) if (!ids.has(item.name)) rmSync(path.join(this.mediaDir, item.name), { recursive: true, force: true });
    for (const row of this.db.prepare("SELECT id FROM transfers WHERE state='queued'").all()) {
      const dir = this.folder(row.id);
      for (const item of readdirSync(dir, { withFileTypes: true })) if (!['visual.webp', 'sound.wav'].includes(item.name)) rmSync(path.join(dir, item.name), { recursive: true, force: true });
    }
    if (this.diskBytes() > this.limits.maxBytes) throw new BridgeError('storage_full', 503);
    } catch (error) {
      try { this.db?.close(); } catch {}
      try { this.lock.exec('ROLLBACK'); } finally { this.lock.close(); this.key.fill(0); }
      throw error;
    }
  }

  digest(label, value) { return createHmac('sha256', this.key).update(label).update('\0').update(value).digest('hex'); }
  encrypt(id, label, value) {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(`${id}:${label}`));
    return Buffer.concat([nonce, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }
  decrypt(id, label, value) {
    const bytes = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(`${id}:${label}`)); cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString('utf8');
  }
  transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  row(id) { return this.db.prepare('SELECT * FROM transfers WHERE id=?').get(id); }
  folder(id) { if (!capability(id, 16)) throw new BridgeError('not_found', 404); return path.join(this.mediaDir, id); }
  paths(id) { const dir = this.folder(id); return { dir, webpPath: path.join(dir, 'visual.webp'), wavPath: path.join(dir, 'sound.wav'), oggPath: path.join(dir, 'sound.ogg') }; }
  diskBytes() {
    let total = 0;
    for (const folder of readdirSync(this.mediaDir, { withFileTypes: true })) {
      if (!folder.isDirectory()) { total += statSync(path.join(this.mediaDir, folder.name)).size; continue; }
      for (const file of readdirSync(path.join(this.mediaDir, folder.name), { withFileTypes: true })) {
        if (!file.isFile()) throw new BridgeError('invalid_storage', 503);
        total += statSync(path.join(this.mediaDir, folder.name, file.name)).size;
      }
    }
    return total;
  }
  capacity() {
    const row = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN state IN (${ACTIVE.map(() => '?').join(',')}) THEN 1 ELSE 0 END),0) AS jobs, COALESCE(SUM(reserved_bytes),0) AS bytes FROM transfers`).get(...ACTIVE);
    return { jobs: row.jobs, reservedBytes: row.bytes, available: row.jobs < this.limits.maxJobs && row.bytes + this.limits.reservationBytes <= this.limits.maxBytes && this.diskBytes() + this.limits.reservationBytes <= this.limits.maxBytes };
  }
  public(row) {
    const result = { id: row.id, state: row.state, expiresAt: row.expires_at, ...(row.error ? { error: row.error } : {}) };
    if (row.state === 'awaiting_message') {
      const claimCode = this.decrypt(row.id, 'claim', row.claim_cipher);
      result.claimCode = claimCode;
      result.waUrl = `https://wa.me/${this.botNumber}?text=${encodeURIComponent(`ZAP ${claimCode}`)}`;
    }
    return result;
  }
  authorize(id, receipt) {
    if (!capability(id, 16) || !capability(receipt, 32)) throw new BridgeError('not_found', 404);
    const row = this.row(id);
    if (!row || !equalSecret(row.receipt_hash, this.digest('receipt', receipt))) throw new BridgeError('not_found', 404);
    if (ACTIVE.includes(row.state) && row.expires_at <= this.clock()) { this.finish(id, row.state === 'sending' ? 'delivery_unknown' : 'expired', { error: row.state === 'sending' ? 'delivery_unknown' : null }); return this.row(id); }
    return row;
  }
  get(id, receipt) { return this.public(this.authorize(id, receipt)); }
  contentDigest({ visual, sound, locale }) {
    const hmac = createHmac('sha256', this.key).update('content\0').update(locale).update('\0');
    hmac.update(String(visual.length)).update(':').update(visual);
    if (sound) hmac.update(String(sound.length)).update(':').update(sound);
    return hmac.digest('hex');
  }
  create({ id, receipt, locale, visual, sound, media }) {
    if (!capability(id, 16) || !capability(receipt, 32) || !LOCALES.has(locale)) throw new BridgeError('invalid_request', 400);
    const contentHash = this.contentDigest({ visual, sound, locale });
    const prior = this.row(id);
    if (prior) {
      const row = this.authorize(id, receipt);
      if (!equalSecret(row.content_hash, contentHash)) throw new BridgeError('conflict', 409);
      return { created: false, transfer: this.public(row) };
    }
    this.sweep();
    if (!this.capacity().available) throw new BridgeError('busy', 429);
    // Bound terminal metadata as well as live files, even during a sustained anonymous flood.
    if (this.db.prepare('SELECT COUNT(*) AS n FROM transfers').get().n >= 20_000) throw new BridgeError('busy', 429);
    const now = this.clock(), claim = randomBytes(16).toString('base64url');
    this.db.prepare(`INSERT INTO transfers(id,receipt_hash,content_hash,state,created_at,expires_at,locale,kind,duration,has_sound,claim_hash,claim_cipher,reserved_bytes)
      VALUES(?,?,?,'receiving',?,?,?,?,?,?,?,?,?)`).run(id, this.digest('receipt', receipt), contentHash, now, now + this.limits.ttlMs, locale, media.kind, media.duration, sound ? 1 : 0, this.digest('claim', claim), this.encrypt(id, 'claim', claim), this.limits.reservationBytes);
    const paths = this.paths(id);
    try {
      mkdirSync(paths.dir, { mode: 0o700 });
      for (const [file, bytes] of [[paths.webpPath, visual], ...(sound ? [[paths.wavPath, sound]] : [])]) {
        writeFileSync(`${file}.part`, bytes, { flag: 'wx', mode: 0o600 }); renameSync(`${file}.part`, file);
      }
      this.db.prepare("UPDATE transfers SET state='awaiting_message' WHERE id=?").run(id);
      return { created: true, transfer: this.public(this.row(id)) };
    } catch {
      this.finish(id, 'failed', { error: 'storage_failure' }); throw new BridgeError('storage_failure', 503);
    }
  }
  claim({ providerMessageId, recipient, code }) {
    if (!capability(code, 16) || typeof providerMessageId !== 'string' || !providerMessageId || providerMessageId.length > 160 || typeof recipient !== 'string' || recipient.length > 160 || !/^[0-9]+(?::[0-9]+)?@(s\.whatsapp\.net|lid)$/.test(recipient)) return null;
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM transfers WHERE claim_hash=?').get(this.digest('claim', code));
      if (!row || row.state !== 'awaiting_message') return null;
      if (row.expires_at <= this.clock()) { this.finish(row.id, 'expired'); return null; }
      const senderHash = this.digest('sender', recipient);
      if (this.db.prepare('SELECT COUNT(*) AS n FROM inbound_events WHERE sender_hash=? AND created_at>?').get(senderHash, this.clock() - 60_000).n >= 5) return null;
      const eventHash = this.digest('event', `${recipient}:${providerMessageId}`);
      if (this.db.prepare('SELECT 1 FROM inbound_events WHERE event_hash=?').get(eventHash)) return null;
      this.db.prepare('INSERT INTO inbound_events VALUES(?,?,?,?)').run(eventHash, row.id, senderHash, this.clock());
      this.db.prepare("UPDATE transfers SET state='queued',recipient_cipher=? WHERE id=? AND state='awaiting_message'").run(this.encrypt(row.id, 'recipient', recipient), row.id);
      return { id: row.id, locale: row.locale };
    });
  }
  take() {
    this.sweep();
    return this.transaction(() => {
      const row = this.db.prepare("SELECT * FROM transfers WHERE state='queued' AND expires_at>? ORDER BY created_at LIMIT 1").get(this.clock());
      if (!row) return null;
      this.db.prepare("UPDATE transfers SET state='processing' WHERE id=? AND state='queued'").run(row.id);
      return { id: row.id, kind: row.kind, duration: row.duration, locale: row.locale, hasSound: !!row.has_sound, expiresAt: row.expires_at, recipient: this.decrypt(row.id, 'recipient', row.recipient_cipher), ...this.paths(row.id) };
    });
  }
  markSending(id, messageId) {
    const row = this.row(id);
    if (!row || row.state !== 'processing') return false;
    if (row.expires_at <= this.clock()) { this.finish(id, 'expired'); return false; }
    const messageHash = messageId ? this.digest('message', `${this.decrypt(id, 'recipient', row.recipient_cipher)}:${messageId}`) : null;
    return !!this.db.prepare("UPDATE transfers SET state='sending',message_hash=? WHERE id=? AND state='processing'").run(messageHash, id).changes;
  }
  cancel(id, receipt) {
    const row = this.authorize(id, receipt);
    if (['cancelled', 'expired'].includes(row.state)) return this.public(row);
    if (!['receiving', 'awaiting_message', 'queued', 'processing'].includes(row.state)) throw new BridgeError('conflict', 409);
    this.finish(id, 'cancelled'); return this.public(this.row(id));
  }
  finish(id, state, { error = null, messageId = null } = {}) {
    if (!TERMINAL.includes(state)) throw new BridgeError('invalid_state', 500);
    const row = this.row(id);
    if (!row || TERMINAL.includes(row.state)) return false;
    // After handoff a deadline cannot prove that the sticker was not sent.
    // Preserve positive acknowledgements; every other outcome stays uncertain.
    if (row.state === 'sending') {
      if (!['accepted', 'delivered'].includes(state)) state = 'delivery_unknown';
    } else if (row.expires_at <= this.clock() && state !== 'delivery_unknown') state = 'expired';
    const messageHash = row.message_hash || (messageId && row.recipient_cipher ? this.digest('message', `${this.decrypt(id, 'recipient', row.recipient_cipher)}:${messageId}`) : null);
    this.db.prepare(`UPDATE transfers SET state=?,finished_at=?,claim_hash=NULL,claim_cipher=NULL,recipient_cipher=NULL,error=?,message_hash=? WHERE id=?`).run(state, this.clock(), error, messageHash, id);
    this.purgeFiles(id);
    return true;
  }
  purgeFiles(id) {
    try { rmSync(this.folder(id), { recursive: true, force: true }); this.db.prepare('UPDATE transfers SET reserved_bytes=0 WHERE id=?').run(id); return true; }
    catch { return false; } // Keep the reservation until a later sweep succeeds.
  }
  confirmReceipt({ messageId, recipient, state }) {
    if (state !== 'delivered' || typeof messageId !== 'string' || messageId.length > 160 || typeof recipient !== 'string' || recipient.length > 160 || !/^[0-9]+(?::[0-9]+)?@(s\.whatsapp\.net|lid)$/.test(recipient)) return false;
    const row = this.db.prepare("SELECT * FROM transfers WHERE message_hash=? AND state IN ('sending','accepted','delivery_unknown')").get(this.digest('message', `${recipient}:${messageId}`));
    if (!row) return false;
    if (row.state === 'sending') return this.finish(row.id, 'delivered', { messageId });
    return !!this.db.prepare("UPDATE transfers SET state='delivered',error=NULL WHERE id=?").run(row.id).changes;
  }
  sweep() {
    const now = this.clock();
    for (const row of this.db.prepare(`SELECT id,state FROM transfers WHERE expires_at<=? AND state IN (${ACTIVE.map(() => '?').join(',')})`).all(now, ...ACTIVE)) this.finish(row.id, row.state === 'sending' ? 'delivery_unknown' : 'expired', { error: row.state === 'sending' ? 'delivery_unknown' : null });
    for (const row of this.db.prepare('SELECT id FROM transfers WHERE finished_at IS NOT NULL AND reserved_bytes>0').all()) this.purgeFiles(row.id);
    const liveIds = new Set(this.db.prepare(`SELECT id FROM transfers WHERE state IN (${ACTIVE.map(() => '?').join(',')})`).all(...ACTIVE).map(row => row.id));
    for (const item of readdirSync(this.mediaDir, { withFileTypes: true })) if (!liveIds.has(item.name)) {
      try { rmSync(path.join(this.mediaDir, item.name), { recursive: true, force: true }); this.db.prepare('UPDATE transfers SET reserved_bytes=0 WHERE id=?').run(item.name); } catch { /* Retry on the next bounded sweep. */ }
    }
    this.db.prepare('DELETE FROM transfers WHERE finished_at IS NOT NULL AND finished_at<=? AND reserved_bytes=0').run(now - this.limits.retentionMs);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.db.close(); }
    finally { try { this.lock.exec('ROLLBACK'); } finally { this.lock.close(); this.key.fill(0); } }
  }
}
