import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { mkdirSync, chmodSync, writeFileSync, renameSync, rmSync, readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BridgeError, LIMITS, LOCALES, capability, equalSecret } from './config.mjs';
import {phoneLocale} from './bot-language.mjs';
import {validPollChoices, pollJid} from './bot-polls.mjs';

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
    this.dir = path.resolve(dir); this.mediaDir = path.join(this.dir, 'media'); this.reverseDir = path.join(this.dir, 'reverse-media');
    this.key = Buffer.from(key); this.botNumber = botNumber; this.clock = clock; this.limits = { ...LIMITS, ...limits };
    mkdirSync(this.reverseDir, { recursive: true, mode: 0o700 }); chmodSync(this.reverseDir, 0o700);
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
      CREATE TABLE IF NOT EXISTS reverse_transfers (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, sender_hash TEXT NOT NULL, event_hash TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        kind TEXT, duration REAL, has_sound INTEGER NOT NULL DEFAULT 0, reserved_bytes INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS reverse_sender_active ON reverse_transfers(sender_hash,state,expires_at);
      CREATE TABLE IF NOT EXISTS reverse_sender_aliases(alias_hash TEXT PRIMARY KEY,sender_hash TEXT NOT NULL,last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bot_preferences(sender_hash TEXT PRIMARY KEY,locale TEXT NOT NULL,updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bot_polls(poll_hash TEXT PRIMARY KEY,sender_hash TEXT NOT NULL,context_cipher TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS bot_polls_sender ON bot_polls(sender_hash,created_at);
      CREATE TABLE IF NOT EXISTS bot_events(event_hash TEXT PRIMARY KEY,sender_hash TEXT NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS bot_sender_created ON bot_events(sender_hash,created_at);
      CREATE TABLE IF NOT EXISTS store_config (name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inbound_events (event_hash TEXT PRIMARY KEY, transfer_id TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE, sender_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS inbound_sender_created ON inbound_events(sender_hash,created_at);
      CREATE INDEX IF NOT EXISTS transfers_state_created ON transfers(state,created_at);
      CREATE INDEX IF NOT EXISTS transfers_expiry ON transfers(expires_at);`);
    if (!this.db.prepare('PRAGMA table_info(bot_preferences)').all().some(column => column.name === 'source')) {
      this.db.exec("ALTER TABLE bot_preferences ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
    }
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
    this.db.prepare("UPDATE reverse_transfers SET state='failed' WHERE state='receiving'").run();
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
    for (const directory of [this.mediaDir, this.reverseDir]) for (const folder of readdirSync(directory, { withFileTypes: true })) {
      if (!folder.isDirectory()) { total += statSync(path.join(directory, folder.name)).size; continue; }
      for (const file of readdirSync(path.join(directory, folder.name), { withFileTypes: true })) {
        if (!file.isFile()) throw new BridgeError('invalid_storage', 503);
        total += statSync(path.join(directory, folder.name, file.name)).size;
      }
    }
    return total;
  }
  capacity() {
    const row = this.db.prepare(`SELECT COALESCE(SUM(CASE WHEN state IN (${ACTIVE.map(() => '?').join(',')}) THEN 1 ELSE 0 END),0) AS jobs, COALESCE(SUM(reserved_bytes),0) AS bytes FROM transfers`).get(...ACTIVE);
    const reverse = this.db.prepare("SELECT COUNT(CASE WHEN state IN ('receiving','ready') THEN 1 END) AS jobs,COALESCE(SUM(reserved_bytes),0) AS bytes FROM reverse_transfers").get();
    row.jobs += reverse.jobs; row.bytes += reverse.bytes;
    return { jobs: row.jobs, reservedBytes: row.bytes, available: row.jobs < this.limits.maxJobs && row.bytes + this.limits.reservationBytes <= this.limits.maxBytes && this.diskBytes() + this.limits.reservationBytes <= this.limits.maxBytes };
  }
  public(row) {
    const result = { id: row.id, state: row.state, expiresAt: row.expires_at, ...(row.error ? { error: row.error } : {}) };
    if (row.state === 'awaiting_message') {
      const claimCode = this.decrypt(row.id, 'claim', row.claim_cipher);
      result.claimCode = claimCode;
      result.waUrl = `https://wa.me/${this.botNumber}?text=${encodeURIComponent(`Sticker ZAP ${claimCode}`)}`;
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
  reversePaths(id) {
    if (!capability(id, 16)) throw new BridgeError('not_found', 404);
    const dir = path.join(this.reverseDir, id);
    return {dir, webpPath: path.join(dir, 'visual.webp'), wavPath: path.join(dir, 'sound.wav')};
  }
  reverseSender(recipient, aliases = []) {
    const addresses = [...new Set([recipient, ...aliases].filter(value => typeof value === 'string' && value.length <= 160 && /^[0-9]+(?::[0-9]+)?@(s\.whatsapp\.net|lid)$/.test(value)).map(value => value.replace(/:\d+(?=@)/, '')))];
    const hashes = addresses.map(value => this.digest('reverse-address', value));
    const identities = [...new Set(hashes.map(hash => this.db.prepare('SELECT sender_hash FROM reverse_sender_aliases WHERE alias_hash=?').get(hash)?.sender_hash).filter(Boolean))];
    const identity = identities[0] ?? hashes[0];
    if (!identity || this.db.prepare('SELECT COUNT(*) AS n FROM reverse_sender_aliases').get().n + hashes.length > 40_000) throw new BridgeError('busy', 429);
    for (const previous of identities.slice(1)) {
      const preference = this.db.prepare('SELECT locale,updated_at,source FROM bot_preferences WHERE sender_hash=?').get(previous);
      if (preference) {
        this.db.prepare(`INSERT INTO bot_preferences(sender_hash,locale,updated_at,source) VALUES(?,?,?,?)
          ON CONFLICT(sender_hash) DO UPDATE SET locale=excluded.locale,updated_at=excluded.updated_at,source=excluded.source
          WHERE (excluded.source='manual' AND bot_preferences.source<>'manual')
            OR (excluded.source=bot_preferences.source AND excluded.updated_at>bot_preferences.updated_at)`)
          .run(identity, preference.locale, preference.updated_at, preference.source);
        this.db.prepare('DELETE FROM bot_preferences WHERE sender_hash=?').run(previous);
      }
      this.db.prepare('UPDATE reverse_transfers SET sender_hash=? WHERE sender_hash=?').run(identity, previous);
      this.db.prepare('UPDATE bot_events SET sender_hash=? WHERE sender_hash=?').run(identity, previous);
      this.db.prepare('UPDATE bot_polls SET sender_hash=? WHERE sender_hash=?').run(identity, previous);
      this.db.prepare('DELETE FROM bot_polls WHERE sender_hash=? AND poll_hash<>(SELECT poll_hash FROM bot_polls WHERE sender_hash=? ORDER BY created_at DESC,poll_hash LIMIT 1)').run(identity, identity);
      this.db.prepare('UPDATE reverse_sender_aliases SET sender_hash=? WHERE sender_hash=?').run(identity, previous);
    }
    for (const hash of hashes) this.db.prepare('INSERT INTO reverse_sender_aliases VALUES(?,?,?) ON CONFLICT(alias_hash) DO UPDATE SET sender_hash=excluded.sender_hash,last_seen=excluded.last_seen').run(hash, identity, this.clock());
    return identity;
  }
  reserveReverse({recipient, providerMessageId, senderAliases}) {
    if (typeof recipient !== 'string' || recipient.length > 160 || !/^[0-9]+(?::[0-9]+)?@(s\.whatsapp\.net|lid)$/.test(recipient)
      || typeof providerMessageId !== 'string' || !providerMessageId || providerMessageId.length > 160) return null;
    this.sweep();
    const senderHash = this.transaction(() => this.reverseSender(recipient, senderAliases));
    return this.transaction(() => {
      const eventHash = this.digest('reverse-event', `${senderHash}:${providerMessageId}`), now = this.clock();
      if (this.db.prepare('SELECT 1 FROM reverse_transfers WHERE event_hash=?').get(eventHash)) return null;
      if (this.db.prepare("SELECT COUNT(*) AS n FROM reverse_transfers WHERE sender_hash=? AND state IN ('receiving','ready') AND expires_at>?").get(senderHash, now).n >= 5) throw new BridgeError('user_limit', 429);
      if (this.db.prepare('SELECT COUNT(*) AS n FROM reverse_transfers WHERE sender_hash=? AND created_at>?').get(senderHash, now - 60_000).n >= 6
        || this.db.prepare('SELECT COUNT(*) AS n FROM reverse_transfers WHERE created_at>?').get(now - 60_000).n >= 20
        || !this.capacity().available || this.db.prepare('SELECT COUNT(*) AS n FROM reverse_transfers').get().n >= 20_000) throw new BridgeError('busy', 429);
      const id = randomBytes(16).toString('base64url'), token = randomBytes(32).toString('base64url');
      this.db.prepare("INSERT INTO reverse_transfers(id,token_hash,sender_hash,event_hash,state,created_at,expires_at,reserved_bytes) VALUES(?,?,?,?,'receiving',?,?,?)")
        .run(id, this.digest('reverse-token', token), senderHash, eventHash, now, now + this.limits.ttlMs, this.limits.reservationBytes);
      try { mkdirSync(this.reversePaths(id).dir, {mode: 0o700}); }
      catch { this.failReverse(id); throw new BridgeError('unavailable', 503); }
      return {id, token, expiresAt: now + this.limits.ttlMs};
    });
  }
  completeReverse(id, {visual, sound, media}) {
    const row = this.db.prepare('SELECT * FROM reverse_transfers WHERE id=?').get(id);
    if (!row || row.state !== 'receiving' || row.expires_at <= this.clock()) throw new BridgeError('not_found', 404);
    const paths = this.reversePaths(id);
    try {
      for (const [file, bytes] of [[paths.webpPath, visual], ...(sound ? [[paths.wavPath, sound]] : [])]) {
        writeFileSync(`${file}.part`, bytes, {flag: 'wx', mode: 0o600}); renameSync(`${file}.part`, file);
      }
      this.db.prepare("UPDATE reverse_transfers SET state='ready',kind=?,duration=?,has_sound=? WHERE id=? AND state='receiving'").run(media.kind, media.duration, sound ? 1 : 0, id);
    } catch { this.failReverse(id); throw new BridgeError('unavailable', 503); }
  }
  failReverse(id) {
    if (this.db.prepare('SELECT state FROM reverse_transfers WHERE id=?').get(id)?.state !== 'receiving') return;
    this.db.prepare("UPDATE reverse_transfers SET state='failed' WHERE id=? AND state='receiving'").run(id);
    this.purgeReverseFiles(id);
  }
  purgeReverseFiles(id) {
    try { rmSync(this.reversePaths(id).dir, {recursive: true, force: true}); this.db.prepare('UPDATE reverse_transfers SET reserved_bytes=0 WHERE id=?').run(id); return true; }
    catch { return false; }
  }
  getReverse(token) {
    if (!capability(token, 32)) throw new BridgeError('not_found', 404);
    this.sweep();
    const row = this.db.prepare("SELECT * FROM reverse_transfers WHERE token_hash=? AND state='ready' AND expires_at>?").get(this.digest('reverse-token', token), this.clock());
    if (!row) throw new BridgeError('not_found', 404);
    const files = this.reversePaths(row.id);
    try {
      const visual = readFileSync(files.webpPath);
      if (visual.length > 1024 * 1024) throw new Error();
      const result = {version: 1, kind: row.kind, expiresAt: row.expires_at, visual: {mime: 'image/webp', data: visual.toString('base64')}};
      if (row.has_sound) {
        const audio = readFileSync(files.wavPath);
        if (audio.length > Math.ceil(2.4 * 1024 * 1024)) throw new Error();
        result.sound = {mime: 'audio/wav', data: audio.toString('base64'), duration: row.duration};
      }
      if (Buffer.byteLength(JSON.stringify(result)) > this.limits.bodyBytes) throw new Error();
      return result;
    } catch { throw new BridgeError('unavailable', 503); }
  }
  allowBotReply({recipient, providerMessageId, senderAliases}, kind) {
    const now = this.clock();
    return this.transaction(() => {
      const sender = this.reverseSender(recipient, senderAliases), event = this.digest('bot-event', `${sender}:${providerMessageId}`);
      if (this.db.prepare('SELECT 1 FROM bot_events WHERE event_hash=?').get(event)
        || this.db.prepare('SELECT COUNT(*) AS n FROM bot_events WHERE sender_hash=? AND created_at>?').get(sender, now - 60_000).n >= 2
        || this.db.prepare('SELECT COUNT(*) AS n FROM bot_events WHERE created_at>?').get(now - 60_000).n >= 60
        || this.db.prepare('SELECT COUNT(*) AS n FROM bot_events').get().n >= 20_000) return false;
      this.db.prepare('INSERT INTO bot_events VALUES(?,?,?,?)').run(event, sender, kind, now); return true;
    });
  }
  getBotLocale({recipient, senderAliases}) {
    const sender = this.transaction(() => this.reverseSender(recipient, senderAliases));
    const saved = this.db.prepare('SELECT locale,source FROM bot_preferences WHERE sender_hash=? AND updated_at>?').get(sender, this.clock() - 30 * 24 * 60 * 60_000);
    if (saved?.source === 'manual') return saved.locale;
    return phoneLocale({recipient, senderAliases}) ?? saved?.locale ?? 'en';
  }
  saveBotPoll(event, {messageId, secret, creators, choices}) {
    if (typeof messageId !== 'string' || !messageId || messageId.length > 160 || !Buffer.isBuffer(secret) || secret.length !== 32
      || !Array.isArray(creators) || !creators.length || creators.length > 2 || !creators.every(pollJid) || !validPollChoices(choices)) throw new BridgeError('invalid_poll', 400);
    const now = this.clock(), hash = this.digest('bot-poll', messageId);
    const context = JSON.stringify({secret:secret.toString('base64url'), creators, choices});
    if (Buffer.byteLength(context) > 4096) throw new BridgeError('invalid_poll', 400);
    this.transaction(() => {
      this.db.prepare('DELETE FROM bot_polls WHERE expires_at<=?').run(now);
      const sender = this.reverseSender(event.recipient, event.senderAliases);
      this.db.prepare('DELETE FROM bot_polls WHERE sender_hash=?').run(sender);
      if (this.db.prepare('SELECT COUNT(*) AS n FROM bot_polls').get().n >= 128) throw new BridgeError('busy', 429);
      this.db.prepare('INSERT INTO bot_polls VALUES(?,?,?,?,?)').run(hash, sender, this.encrypt(hash, 'poll', context), now, now + 10 * 60_000);
    });
  }
  getBotPoll(event) {
    if (typeof event.pollMessageId !== 'string' || event.pollMessageId.length > 160) return;
    const sender = this.transaction(() => this.reverseSender(event.recipient, event.senderAliases));
    const hash = this.digest('bot-poll', event.pollMessageId);
    const row = this.db.prepare('SELECT context_cipher FROM bot_polls WHERE poll_hash=? AND sender_hash=? AND expires_at>?').get(hash, sender, this.clock());
    if (!row) return;
    try { return JSON.parse(this.decrypt(hash, 'poll', row.context_cipher)); } catch { return; }
  }
  clearBotPoll(event, messageId) {
    const sender = this.transaction(() => this.reverseSender(event.recipient, event.senderAliases));
    if (messageId !== undefined) return !!this.db.prepare('DELETE FROM bot_polls WHERE sender_hash=? AND poll_hash=? AND expires_at>?').run(sender, this.digest('bot-poll', messageId), this.clock()).changes;
    this.db.prepare('DELETE FROM bot_polls WHERE sender_hash=?').run(sender);
  }
  rememberBotLocale({recipient, senderAliases}, locale, {source = 'manual'} = {}) {
    if (!LOCALES.has(locale) || !['manual', 'website'].includes(source)) return;
    this.transaction(() => {
      const sender = this.reverseSender(recipient, senderAliases);
      this.db.prepare(`INSERT INTO bot_preferences(sender_hash,locale,updated_at,source) VALUES(?,?,?,?)
        ON CONFLICT(sender_hash) DO UPDATE SET locale=excluded.locale,updated_at=excluded.updated_at,source=excluded.source
        WHERE excluded.source='manual' OR bot_preferences.source<>'manual'`).run(sender, locale, this.clock(), source);
    });
  }
  sweep() {
    const now = this.clock();
    this.db.prepare('DELETE FROM bot_polls WHERE expires_at<=?').run(now);
    this.db.prepare("UPDATE reverse_transfers SET state='expired' WHERE expires_at<=? AND state IN ('receiving','ready')").run(now);
    for (const row of this.db.prepare("SELECT id FROM reverse_transfers WHERE state NOT IN ('receiving','ready') AND reserved_bytes>0").all()) this.purgeReverseFiles(row.id);
    const reverseLive = new Set(this.db.prepare("SELECT id FROM reverse_transfers WHERE state IN ('receiving','ready')").all().map(row => row.id));
    for (const item of readdirSync(this.reverseDir, {withFileTypes: true})) if (!reverseLive.has(item.name)) {
      try { rmSync(path.join(this.reverseDir, item.name), {recursive: true, force: true}); this.db.prepare('UPDATE reverse_transfers SET reserved_bytes=0 WHERE id=?').run(item.name); } catch {}
    }
    this.db.prepare("DELETE FROM reverse_transfers WHERE state NOT IN ('receiving','ready') AND created_at<=? AND reserved_bytes=0").run(now - this.limits.retentionMs);
    this.db.prepare('DELETE FROM bot_events WHERE created_at<=?').run(now - this.limits.retentionMs);
    this.db.prepare('DELETE FROM bot_preferences WHERE updated_at<=?').run(now - 30 * 24 * 60 * 60_000);
    this.db.prepare('DELETE FROM reverse_sender_aliases WHERE last_seen<=? AND NOT EXISTS (SELECT 1 FROM bot_preferences WHERE bot_preferences.sender_hash=reverse_sender_aliases.sender_hash)').run(now - this.limits.retentionMs);
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
