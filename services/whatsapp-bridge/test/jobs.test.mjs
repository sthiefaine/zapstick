import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BridgeStore } from '../src/store.mjs';
import { BridgeWorker } from '../src/worker.mjs';
import { loadConfig } from '../src/config.mjs';

const secret = bytes => randomBytes(bytes).toString('base64url');
function setup(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'zapstick-jobs-')), key = randomBytes(32);
  let now = 1_000_000;
  let store = new BridgeStore({ dir, key, botNumber: '33612345678', clock: () => now, ...options });
  t.after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
  const create = (more = {}) => {
    const input = { id: secret(16), receipt: secret(32), locale: 'fr', visual: Buffer.from('fake-visual-for-job-tests'), media: { kind: 'static', duration: 0 }, ...more };
    return { input, ...store.create(input) };
  };
  return { get store() { return store; }, dir, key, create, now: () => now, advance: ms => { now += ms; }, reopen: () => { store.close(); store = new BridgeStore({ dir, key, botNumber: '33612345678', clock: () => now, ...options }); return store; } };
}
const claim = (s, job, recipient = '33687654321@s.whatsapp.net', providerMessageId = secret(12)) => s.store.claim({ recipient, providerMessageId, code: job.transfer.claimCode });
const error = code => e => e?.code === code;

test('configuration fails closed and separates sound flag', () => {
  assert.throws(() => loadConfig({}), error('invalid_service_configuration'));
  const base = { WHATSAPP_BRIDGE_TOKEN: secret(32), WHATSAPP_TRANSFER_KEY: secret(32) };
  assert.equal(loadConfig(base).enabled, false);
  assert.equal(loadConfig({ ...base, WHATSAPP_SOUND_ENABLED: 'true' }).soundEnabled, false);
  assert.throws(() => loadConfig({ ...base, WHATSAPP_BRIDGE_ENABLED: 'true' }), error('invalid_account_configuration'));
  assert.equal(loadConfig({ ...base, WHATSAPP_BRIDGE_ENABLED: 'true', WHATSAPP_AUTH_KEY: secret(32), WHATSAPP_BOT_NUMBER: '33612345678' }).enabled, true);
});

test('idempotent upload and independent receipt survive a lost response and restart', t => {
  const s = setup(t), job = s.create();
  assert.equal(job.created, true); assert.equal(typeof job.transfer.expiresAt, 'number');
  assert.equal(job.transfer.waUrl, `https://wa.me/33612345678?text=ZAP%20${job.transfer.claimCode}`);
  assert.equal(s.store.create(job.input).created, false);
  assert.deepEqual(s.store.get(job.input.id, job.input.receipt), job.transfer);
  assert.throws(() => s.store.get(job.input.id, secret(32)), error('not_found'));
  assert.throws(() => s.store.get(secret(16), secret(32)), error('not_found'));
  assert.throws(() => s.store.create({ ...job.input, visual: Buffer.from('changed') }), error('conflict'));
  s.reopen(); assert.deepEqual(s.store.get(job.input.id, job.input.receipt), job.transfer);
});

test('claim is atomic, single-use and routed to the actual incoming LID', t => {
  const s = setup(t), job = s.create();
  assert.deepEqual(claim(s, job, '123456789012345@lid', 'same-message'), { id: job.input.id, locale: 'fr' });
  assert.equal(claim(s, job, '33699999999@s.whatsapp.net'), null);
  assert.equal(claim(s, job, '123456789012345@lid', 'same-message'), null);
  const taken = s.store.take(); assert.equal(taken.recipient, '123456789012345@lid');
  assert.equal(s.store.take(), null); assert.equal(s.store.get(job.input.id, job.input.receipt).claimCode, undefined);
});

test('second store is refused before recovery can mutate another worker or delete its files', t => {
  const s = setup(t), processing = s.create(), sending = s.create();
  claim(s, processing); s.store.take();
  claim(s, sending); s.store.take(); s.store.markSending(sending.input.id, 'in-flight-message');
  assert.throws(() => new BridgeStore({dir:s.dir,key:s.key,botNumber:'33612345678',clock:s.now}),error('storage_in_use'));
  assert.equal(s.store.row(processing.input.id).state,'processing');
  assert.equal(s.store.row(sending.input.id).state,'sending');
  assert.equal(existsSync(s.store.paths(processing.input.id).webpPath),true);
  assert.equal(existsSync(s.store.paths(sending.input.id).webpPath),true);
  s.reopen();
  assert.equal(s.store.row(processing.input.id).state,'queued');
  assert.equal(s.store.row(sending.input.id).state,'delivery_unknown');
});

test('groups, malformed codes and duplicate inbound events do not create sends', t => {
  const s = setup(t), job = s.create();
  assert.equal(claim(s, job, '12345@g.us'), null);
  assert.equal(s.store.claim({ recipient: '12345@lid', providerMessageId: 'x', code: '../../secret' }), null);
  assert.equal(s.store.take(), null);
});

test('credentials and recipients are encrypted, then cleared with all media at completion', t => {
  const s = setup(t), job = s.create(); claim(s, job); s.store.take();
  const before = s.store.row(job.input.id);
  assert.ok(before.claim_cipher); assert.ok(before.recipient_cipher);
  assert.equal(JSON.stringify(before).includes(job.transfer.claimCode), false);
  assert.equal(JSON.stringify(before).includes('33687654321'), false);
  assert.equal(readFileSync(path.join(s.dir, 'transfers.sqlite')).includes(Buffer.from(job.transfer.claimCode)), false);
  s.store.markSending(job.input.id, 'transport-message'); s.store.finish(job.input.id, 'accepted', { messageId: 'transport-message' });
  assert.equal(existsSync(s.store.folder(job.input.id)), false);
  const row = s.store.row(job.input.id);
  for (const field of ['claim_hash', 'claim_cipher', 'recipient_cipher']) assert.equal(row[field], null);
  assert.equal(row.reserved_bytes, 0);
  assert.equal(s.store.confirmReceipt({ messageId: 'transport-message', recipient: '33699999999@s.whatsapp.net', state: 'delivered' }), false);
  assert.equal(s.store.confirmReceipt({ messageId: 'transport-message', recipient: '33687654321@s.whatsapp.net', state: 'delivered' }), true);
  assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'delivered');
});

test('absolute TTL cannot be extended by GET, POST or a late claim', t => {
  const s = setup(t), job = s.create(); s.advance(599_999);
  assert.equal(s.store.create(job.input).transfer.expiresAt, job.transfer.expiresAt);
  s.advance(1); assert.equal(claim(s, job), null);
  assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'expired');
  assert.equal(existsSync(s.store.folder(job.input.id)), false);
  assert.equal(s.store.create(job.input).transfer.state, 'expired');
  s.advance(86_400_001); s.store.sweep();
  assert.throws(() => s.store.get(job.input.id, job.input.receipt), error('not_found'));
});

test('an acknowledgement after the deadline never presents a handed-off sticker as unsent', t => {
  const s=setup(t),known=s.create(),unknown=s.create(),delivered=s.create();
  for(const [job,messageId]of [[known,'known-outgoing'],[unknown,'unknown-outgoing'],[delivered,'delivered-outgoing']]){claim(s,job);s.store.take();s.store.markSending(job.input.id,messageId);}
  s.advance(600001);
  assert.equal(s.store.finish(known.input.id,'accepted',{messageId:'known-outgoing'}),true);
  assert.equal(s.store.row(known.input.id).state,'accepted');
  assert.equal(s.store.get(unknown.input.id,unknown.input.receipt).state,'delivery_unknown');
  assert.equal(s.store.confirmReceipt({messageId:'unknown-outgoing',recipient:'33687654321@s.whatsapp.net',state:'delivered'}),true);
  assert.equal(s.store.row(unknown.input.id).state,'delivered');
  assert.equal(s.store.confirmReceipt({messageId:'delivered-outgoing',recipient:'33687654321@s.whatsapp.net',state:'delivered'}),true);
  assert.equal(s.store.row(delivered.input.id).state,'delivered');
  for(const job of [known,unknown,delivered])assert.equal(existsSync(s.store.folder(job.input.id)),false);
});

test('cancel deterministically wins before handoff, but cannot recall a sent message', t => {
  const s = setup(t), first = s.create(); claim(s, first); s.store.take();
  assert.equal(s.store.cancel(first.input.id, first.input.receipt).state, 'cancelled');
  assert.equal(s.store.markSending(first.input.id, 'late'), false);
  assert.equal(s.store.finish(first.input.id, 'accepted'), false);
  const second = s.create(); claim(s, second); s.store.take(); s.store.markSending(second.input.id, 'sent');
  assert.throws(() => s.store.cancel(second.input.id, second.input.receipt), error('conflict'));
});

test('restart requeues pre-handoff work, removes derivatives and preserves uncertain sends', t => {
  const s = setup(t), first = s.create(); claim(s, first); const taken = s.store.take(); writeFileSync(taken.oggPath, 'partial-derivative');
  s.reopen(); assert.equal(existsSync(taken.oggPath), false); assert.equal(s.store.take().id, first.input.id);
  s.store.markSending(first.input.id, 'unknown-message');
  s.reopen(); assert.equal(s.store.get(first.input.id, first.input.receipt).state, 'delivery_unknown');
  assert.equal(s.store.take(), null);
  assert.equal(s.store.confirmReceipt({ messageId: 'unknown-message', recipient: '33687654321@s.whatsapp.net', state: 'delivered' }), true);
});

test('job/disk reservations bound admission and are released by cancellation', t => {
  const s = setup(t, { limits: { maxJobs: 2, maxBytes: 10 * 1024 * 1024 } });
  const first = s.create(); s.create(); assert.equal(s.store.capacity().available, false);
  assert.throws(() => s.create(), error('busy'));
  s.store.cancel(first.input.id, first.input.receipt); assert.equal(s.store.capacity().available, true); s.create();
  assert.ok(s.store.capacity().reservedBytes <= 10 * 1024 * 1024);
});

test('startup purges orphan and expired media without retaining recipient data', t => {
  const s = setup(t), job = s.create(); claim(s, job);
  s.advance(600_000); s.reopen();
  assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'expired');
  assert.deepEqual(readdirSync(path.join(s.dir, 'media')), []);
  assert.equal(s.store.row(job.input.id).recipient_cipher, null);
});

test('worker sends one exact result, persists handoff and cleans completed files', async t => {
  const s = setup(t), job = s.create(); claim(s, job); const sends = [];
  const transport = { isReady: () => true, send: async options => { sends.push(options); await options.onHandoff({ messageId: 'test-send' }); return { messageId: 'test-send' }; } };
  const worker = new BridgeWorker({ store: s.store, transport, enabled: true, encodeOpus: async () => assert.fail('no sound conversion for static') });
  await worker.kick(); await worker.close();
  assert.equal(sends.length, 1); assert.equal(sends[0].recipient, '33687654321@s.whatsapp.net');
  assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'accepted');
});

test('worker leaves uncertain handoffs terminal instead of retrying', async t => {
  const s = setup(t), job = s.create(); claim(s, job); let attempts = 0;
  const transport = { isReady: () => true, send: async options => { attempts++; await options.onHandoff({ messageId: 'unknown' }); throw Object.assign(new Error('network'), { code: 'delivery_unknown', messageId: 'unknown' }); } };
  const worker = new BridgeWorker({ store: s.store, transport, enabled: true });
  await worker.kick(); await worker.kick(); await worker.close();
  assert.equal(attempts, 1); assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'delivery_unknown');
});

test('cancel during sound conversion aborts the process and cannot later send', async t => {
  const s = setup(t), job = s.create({ sound: Buffer.from('wav'), media: { kind: 'animated', duration: 3 } }); claim(s, job);
  let conversionStarted; const started = new Promise(resolve => { conversionStarted = resolve; });
  const transport = { isReady: () => true, send: async () => assert.fail('cancelled send') };
  const worker = new BridgeWorker({ store: s.store, transport, enabled: true, soundEnabled: true, encodeOpus: async ({ signal }) => { conversionStarted(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); } });
  const running = worker.kick(); await started;
  s.store.cancel(job.input.id, job.input.receipt); worker.cancel(job.input.id);
  await running; await worker.close(); assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'cancelled');
});

test('receipt can arrive before send resolves without losing confirmation', async t => {
  const s = setup(t), job = s.create(); claim(s, job);
  const transport = { isReady: () => true, send: async options => { await options.onHandoff({ messageId: 'early' }); s.store.confirmReceipt({ messageId: 'early', recipient: options.recipient, state: 'delivered' }); return { messageId: 'early' }; } };
  const worker = new BridgeWorker({ store: s.store, transport, enabled: true });
  await worker.kick(); await worker.close(); assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'delivered');
});

test('absolute expiry aborts in-progress conversion and purges files at the deadline', async t => {
  const s = setup(t, { clock: Date.now, limits: { ttlMs: 60 } });
  const job = s.create({ sound: Buffer.from('wav'), media: { kind: 'animated', duration: 3 } }); claim(s, job);
  const transport = { isReady: () => true, send: async () => assert.fail('expired conversion cannot send') };
  const worker = new BridgeWorker({ store: s.store, transport, enabled: true, soundEnabled: true, encodeOpus: async ({ signal }) => { await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); } });
  // Keep a referenced timer while awaiting the intentionally unref'ed worker deadline.
  const keeper = setTimeout(() => {}, 500);
  try { await worker.kick(); await worker.close(); }
  finally { clearTimeout(keeper); }
  assert.equal(s.store.get(job.input.id, job.input.receipt).state, 'expired'); assert.equal(existsSync(s.store.folder(job.input.id)), false);
});
