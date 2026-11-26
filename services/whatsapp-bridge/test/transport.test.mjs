import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import * as sdk from '@whiskeysockets/baileys';
import { createWhatsAppTransport, parseClaimMessage } from '../src/transport.mjs';
import { embeddedAudioBytes, withSoundSticker } from '../src/sound-adapter.mjs';

const code = randomBytes(16).toString('base64url');
const jid = '33000000001@lid';
const message = (overrides = {}) => ({ key: { id: 'incoming-test-id', remoteJid: jid, fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: `ZAP ${code}` }, ...overrides });
const turn = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'zapstick-transport-test-'));
  const webpPath = join(directory, 'visual.webp'), oggPath = join(directory, 'sound.ogg');
  await writeFile(webpPath, Buffer.from('RIFFfixture-WEBP'));
  await writeFile(oggPath, Buffer.from('OggSfixture-opus'));
  const sockets = [], prepared = [], relayed = [], order = [], claims = [], receipts = [];
  let closed = 0, config;
  const authStore = { state: { creds: { registered: options.registered ?? true }, keys: {} }, async saveCreds(update) { Object.assign(this.state.creds, update); }, close() { closed++; } };
  const fake = {
    ...sdk,
    default(value) {
      config = value;
      const socket = { ev: new EventEmitter(), user: { id: '33000000000@s.whatsapp.net', lid: '33000000000@lid' },
        end() {}, waUploadToServer: async () => ({ directPath: '/fixture' }),
        async relayMessage(recipient, content, { messageId }) {
          order.push('relay');
          const encoded = Buffer.from(sdk.proto.Message.encode(content).finish());
          relayed.push({ recipient, content, messageId, encoded });
          if (options.relay) return options.relay({ recipient, content, messageId, encoded });
        }
      };
      sockets.push(socket); return socket;
    },
    async prepareWAMessageMedia(content) {
      prepared.push(content);
      if (options.prepare) await options.prepare(content);
      if (content.audio) return sdk.proto.Message.fromObject({ audioMessage: { url: 'https://fixture.invalid/audio', directPath: '/audio', fileSha256: Buffer.alloc(32, 2), mediaKey: Buffer.alloc(32, 3), mimetype: content.mimetype, seconds: content.seconds } });
      return sdk.proto.Message.fromObject({ stickerMessage: { url: 'https://fixture.invalid/sticker', directPath: '/sticker', fileSha256: Buffer.alloc(32, 1), mediaKey: Buffer.alloc(32, 4), isAnimated: content.isAnimated, width: 512, height: 512 } });
    }
  };
  const transport = createWhatsAppTransport({ authDir: directory, authKey: randomBytes(32), onClaim: claim => { claims.push(claim); }, onReceipt: receipt => { receipts.push(receipt); }, soundEnabled: true, reconnect: false,
    loadBaileys: async () => fake, authStoreFactory: () => authStore, ...options.transport });
  t.after(async () => { await transport.close(); await rm(directory, { recursive: true, force: true }); });
  return { transport, sockets, prepared, relayed, order, claims, receipts, webpPath, oggPath, get config() { return config; }, get closed() { return closed; },
    async open() { await transport.connect(); sockets.at(-1).ev.emit('connection.update', { connection: 'open' }); } };
}

test('claim parser accepts canonical codes from individual PN/LID chats only', () => {
  assert.deepEqual(parseClaimMessage(message()), { providerMessageId: 'incoming-test-id', recipient: jid, code });
  assert.equal(parseClaimMessage(message({ key: { id: 'id', remoteJid: '33000000001@s.whatsapp.net', fromMe: false } })).recipient, '33000000001@s.whatsapp.net');
  for (const invalid of [message({ key: { id: 'id', remoteJid: jid, fromMe: true } }), message({ key: { id: 'id', remoteJid: '123@g.us' } }), message({ key: { id: 'id', remoteJid: 'status@broadcast' } }), message({ message: { conversation: `ZAP ${code} extra` } }), message({ messageTimestamp: 0 }), message({ message: { conversation: 'ZAP ' + 'B'.repeat(22) } })]) assert.equal(parseClaimMessage(invalid, Date.now() / 1000), undefined);
});

test('a new regular session requires private pairing without creating a network socket', async t => {
  const f = await fixture(t, { registered: false });
  await f.transport.connect();
  assert.equal(f.transport.getState(), 'needs_pairing');
  assert.equal(f.transport.isReady(), false);
  assert.equal(f.sockets.length, 0);
});

test('readiness requires the configured dedicated account rather than an accidentally scanned personal account', async t => {
  const wrong=await fixture(t,{transport:{expectedNumber:'33000000099'}});await wrong.open();
  assert.equal(wrong.transport.getState(),'wrong_account');assert.equal(wrong.transport.isReady(),false);
  await assert.rejects(wrong.transport.send({recipient:jid,webpPath:wrong.webpPath,kind:'static'}),{code:'unavailable'});
  assert.equal(wrong.relayed.length,0);
  const correct=await fixture(t,{transport:{expectedNumber:'33000000000'}});await correct.open();
  assert.equal(correct.transport.isReady(),true);
});

test('claims ignore history, own messages, groups and request replay', async t => {
  const f = await fixture(t); await f.open();
  const ev = f.sockets[0].ev;
  ev.emit('messages.upsert', { type: 'append', messages: [message()] });
  ev.emit('messages.upsert', { type: 'notify', requestId: 'history-request', messages: [message()] });
  ev.emit('messages.upsert', { type: 'notify', messages: [message({ key: { id: 'a', remoteJid: jid, fromMe: true } }), message({ key: { id: 'b', remoteJid: '123@g.us' } }), message({ messageTimestamp: 1 }), message()] });
  await turn();
  assert.equal(f.claims.length, 1);
  assert.equal(f.claims[0].recipient, jid);
  assert.equal(f.config.syncFullHistory, false);
  assert.equal(f.config.enableRecentMessageCache, false);
  assert.equal(f.config.logger.level, 'silent');
});

test('non-interactive transport never publishes a QR and disconnect clears readiness', async t => {
  const f = await fixture(t); await f.open();
  assert.equal(f.transport.isReady(), true);
  f.sockets[0].ev.emit('connection.update', { qr: 'private-qr-fixture' });
  assert.equal(f.transport.getState(), 'needs_pairing');
  assert.equal(f.transport.isReady(), false);
  await f.transport.close();
  assert.equal(f.closed, 1);
});

test('sound survives final Message encoding, and identical visuals keep independent audio', async () => {
  function visual() { return sdk.generateWAMessageFromContent(jid, sdk.proto.Message.fromObject({ stickerMessage: { fileSha256: Buffer.alloc(32, 1), isAnimated: true } }), { userJid: '33000000000@lid' }).message; }
  const first = visual(), second = visual(), unrelated = visual();
  await withSoundSticker({ proto: sdk.proto, message: first, audio: { url: 'https://fixture.invalid/one', seconds: 2 } }, async () => {
    const one = embeddedAudioBytes(sdk.proto.Message.encode(first).finish());
    assert.equal(sdk.proto.Message.AudioMessage.decode(one).url, 'https://fixture.invalid/one');
    assert.equal(embeddedAudioBytes(sdk.proto.Message.encode(unrelated).finish()), undefined);
    await withSoundSticker({ proto: sdk.proto, message: second, audio: { url: 'https://fixture.invalid/two', seconds: 3 } }, async () => {
      assert.equal(sdk.proto.Message.AudioMessage.decode(embeddedAudioBytes(sdk.proto.Message.encode(second).finish())).url, 'https://fixture.invalid/two');
      assert.deepEqual(embeddedAudioBytes(sdk.proto.Message.encode(first).finish()), one);
      const clone = sdk.proto.Message.fromObject(sdk.proto.Message.toObject(first));
      assert.equal(embeddedAudioBytes(sdk.proto.Message.encode(clone).finish()), undefined);
    });
    assert.equal(embeddedAudioBytes(sdk.proto.Message.encode(second).finish()), undefined);
  });
  assert.equal(embeddedAudioBytes(sdk.proto.Message.encode(first).finish()), undefined);
});

test('sound attachment is removed even when work fails', async () => {
  const content = sdk.proto.Message.fromObject({ stickerMessage: { fileSha256: Buffer.alloc(32, 5) } });
  await assert.rejects(withSoundSticker({ proto: sdk.proto, message: content, audio: { seconds: 1 } }, async () => { throw new Error('fixture failure'); }));
  assert.equal(embeddedAudioBytes(sdk.proto.Message.encode(content).finish()), undefined);
  assert.throws(() => embeddedAudioBytes(Buffer.from([0xd2, 0x01, 0xff])), /protobuf/);
});

test('fixed/animated send is native, handoff is persisted first, real JID remains unchanged', async t => {
  const f = await fixture(t); await f.open();
  const result = await f.transport.send({ recipient: jid, webpPath: f.webpPath, kind: 'animated', onHandoff: async ({ messageId }) => { assert.ok(messageId); f.order.push('persist'); } });
  assert.ok(result.messageId);
  assert.deepEqual(f.order, ['persist', 'relay']);
  assert.equal(f.relayed[0].recipient, jid);
  assert.equal(f.relayed[0].content.stickerMessage.isAnimated, true);
  assert.equal(embeddedAudioBytes(f.relayed[0].encoded), undefined);
});

test('sound send uploads both media and embeds an AudioMessage in the final native sticker', async t => {
  const f = await fixture(t); await f.open();
  await f.transport.send({ recipient: jid, webpPath: f.webpPath, oggPath: f.oggPath, kind: 'animated', duration: 2.3 });
  assert.equal(f.prepared.length, 2);
  const audio = sdk.proto.Message.AudioMessage.decode(embeddedAudioBytes(f.relayed[0].encoded));
  assert.equal(audio.mimetype, 'audio/ogg; codecs=opus');
  assert.equal(audio.ptt, true);
  assert.equal(audio.seconds, 3);
  assert.equal(embeddedAudioBytes(sdk.proto.Message.encode(f.relayed[0].content).finish()), undefined);
});

test('disabled sound fails explicitly instead of sending a muted sticker', async t => {
  const f = await fixture(t, { transport: { soundEnabled: false } }); await f.open();
  await assert.rejects(f.transport.send({ recipient: jid, webpPath: f.webpPath, oggPath: f.oggPath, kind: 'animated', duration: 2 }), { code: 'unsupported_sound' });
  assert.equal(f.relayed.length, 0);
});

test('abort during media preparation prevents relay and handoff', async t => {
  const controller = new AbortController();
  const f = await fixture(t, { prepare() { controller.abort(); } }); await f.open();
  await assert.rejects(f.transport.send({ recipient: jid, webpPath: f.webpPath, kind: 'animated', signal: controller.signal }), { code: 'expired' });
  assert.equal(f.relayed.length, 0);
});

test('a failed handoff callback prevents relay; relay errors become delivery_unknown', async t => {
  const f = await fixture(t, { relay: () => { throw new Error('private transport trace must not escape'); } }); await f.open();
  await assert.rejects(f.transport.send({ recipient: jid, webpPath: f.webpPath, kind: 'static', onHandoff() { throw Object.assign(new Error('expired'), { code: 'expired' }); } }), { code: 'expired' });
  assert.equal(f.relayed.length, 0);
  await assert.rejects(f.transport.send({ recipient: jid, webpPath: f.webpPath, kind: 'static' }), error => error.code === 'delivery_unknown' && typeof error.messageId === 'string' && !error.message.includes('private transport trace'));
  assert.equal(f.relayed.length, 1);
});

test('receipts for tracked outgoing messages retain the actual recipient chat', async t => {
  const f = await fixture(t); await f.open();
  const { messageId } = await f.transport.send({ recipient: jid, webpPath: f.webpPath, kind: 'static' });
  const ev = f.sockets[0].ev;
  ev.emit('messages.update', [{ key: { id: messageId, fromMe: true, remoteJid: 'other@lid' }, update: { status: 3 } }]);
  ev.emit('messages.update', [{ key: { id: messageId, fromMe: true, remoteJid: jid }, update: { status: 2 } }]);
  assert.equal(f.receipts.length, 0);
  ev.emit('messages.update', [{ key: { id: messageId, fromMe: true, remoteJid: jid }, update: { status: 3 } }]);
  await turn();
  assert.deepEqual(f.receipts, [{ messageId, recipient: jid, state: 'delivered' }]);
});

test('own private receipts survive an empty send cache for durable store reconciliation', async t => {
  const f = await fixture(t); await f.open();
  const ev = f.sockets[0].ev, messageId = 'persisted-before-restart';
  for (const key of [{id:messageId,fromMe:false,remoteJid:jid},{id:messageId,fromMe:true,remoteJid:'123@g.us'},{id:'x'.repeat(161),fromMe:true,remoteJid:jid}]) ev.emit('messages.update', [{key,update:{status:3}}]);
  assert.equal(f.receipts.length,0);
  ev.emit('messages.update', [{key:{id:messageId,fromMe:true,remoteJid:jid},update:{status:3}}]);
  await turn();
  assert.deepEqual(f.receipts,[{messageId,recipient:jid,state:'delivered'}]);
});

test('transport serializes sends until each handoff completes', { timeout: 2000 }, async t => {
  let release, didEnter;
  const pending = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { didEnter = resolve; });
  let relays = 0;
  const f = await fixture(t, { async relay() { relays++; if (relays === 1) { didEnter(); await pending; } } }); await f.open();
  const first = f.transport.send({ recipient: jid, webpPath: f.webpPath, kind: 'static' });
  const second = f.transport.send({ recipient: jid, webpPath: f.webpPath, kind: 'static' });
  await entered;
  assert.equal(relays, 1);
  release(); await Promise.all([first, second]);
  assert.equal(relays, 2);
});
