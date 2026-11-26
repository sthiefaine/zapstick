import { readFile } from 'node:fs/promises';
import { openAuthStore } from './auth.mjs';
import { withSoundSticker } from './sound-adapter.mjs';
import { loadBaileysPrivately } from './private-console.mjs';

const noop = () => {};
const silentLogger = { level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop, child() { return this; } };
const privateJid = value => typeof value === 'string' && /^\d+(?::\d+)?@(?:s\.whatsapp\.net|lid)$/.test(value);

function failure(code, message, messageId) {
  const error = new Error(message);
  error.code = code;
  if (messageId) error.messageId = messageId;
  return error;
}

export function parseClaimMessage(message, connectedAt = 0) {
  const key = message?.key;
  if (!key || key.fromMe || !privateJid(key.remoteJid) || typeof key.id !== 'string' || !key.id || key.id.length > 160 || key.participant) return undefined;
  const timestamp = Number(message.messageTimestamp);
  if (!Number.isFinite(timestamp) || timestamp < connectedAt - 5 || timestamp > Date.now() / 1000 + 60) return undefined;
  const text = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
  if (typeof text !== 'string') return undefined;
  const match = /^(?:Sticker )?ZAP ([A-Za-z0-9_-]{22})$/.exec(text);
  if (!match || Buffer.from(match[1], 'base64url').toString('base64url') !== match[1]) return undefined;
  return { providerMessageId: key.id, recipient: key.remoteJid, code: match[1] };
}

/** No network access is made until connect() is explicitly called. A regular
 * service never displays a QR; only pair.mjs opts into an interactive callback. */
export function createWhatsAppTransport({
  authDir, authKey, expectedNumber, soundEnabled = false, onClaim = async () => {}, onReceipt = async () => {},
  allowPairing = false, onQr, onState = noop,
  loadBaileys = loadBaileysPrivately, authStoreFactory = openAuthStore,
  reconnect = true
}) {
  let state = 'idle', stopped = false, socket, store, baileys, connecting, reconnectTimer;
  let attempt = 0, connectedAt = 0, inboundPending = 0, sendTail = Promise.resolve();
  const sent = new Map();
  const setState = next => { state = next; try { onState(next); } catch {} };
  const handlers = new Map();

  function removeHandlers(target) {
    const entries = handlers.get(target);
    if (!entries) return;
    for (const [event, fn] of entries) target.ev.off(event, fn);
    handlers.delete(target);
  }
  function endSocket(target, reason) {
    if (!target) return;
    removeHandlers(target);
    try { target.end(new Error(reason)); } catch {}
    if (socket === target) socket = undefined;
  }
  function listen(target, event, handler) {
    target.ev.on(event, handler);
    const entries = handlers.get(target) ?? [];
    entries.push([event, handler]); handlers.set(target, entries);
  }
  function scheduleReconnect() {
    if (stopped || !reconnect || reconnectTimer) return;
    if (attempt >= 8) { setState('error'); return; }
    setState('reconnecting');
    const wait = Math.min(30_000, 1000 * 2 ** attempt++) + Math.floor(Math.random() * 500);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect().catch(() => { if (!stopped) scheduleReconnect(); });
    }, wait);
    reconnectTimer.unref();
  }
  function emitReceipt(key) {
    if (key?.fromMe !== true || !privateJid(key.remoteJid) || key.remoteJid.length > 160 || typeof key.id !== 'string' || !key.id || key.id.length > 160) return;
    const saved = sent.get(key.id);
    if (saved && key.remoteJid !== saved.recipient) return;
    sent.delete(key.id);
    // Persisted HMAC(message ID, recipient) is authoritative, including after a
    // restart that loses this process's optional send cache. Unknown IDs are ignored by the store.
    Promise.resolve(onReceipt({ messageId: key.id, recipient: key.remoteJid, state: 'delivered' })).catch(noop);
  }
  async function start() {
    if (stopped) throw failure('unavailable', 'WhatsApp transport is closed.');
    if (socket && ['connecting', 'connected'].includes(state)) return;
    if (!baileys) baileys = await loadBaileys();
    if (stopped) return;
    if (!store) store = authStoreFactory({ authDir, authKey, initAuthCreds: baileys.initAuthCreds, BufferJSON: baileys.BufferJSON, proto: baileys.proto });
    // QR-linked sessions persist `me`; Baileys' `registered` flag can remain
    // false. Use the same identity that its login handshake consumes.
    if (!privateJid(store.state.creds.me?.id) && !allowPairing) { setState('needs_pairing'); return; }
    setState('connecting');
    const target = baileys.default({
      auth: store.state, logger: silentLogger, printQRInTerminal: false,
      browser: baileys.Browsers?.ubuntu?.('Zapstick') ?? ['Zapstick', 'Chrome', '1.0.0'],
      syncFullHistory: false, shouldSyncHistoryMessage: () => false,
      markOnlineOnConnect: false, emitOwnEvents: false, enableRecentMessageCache: false,
      maxMsgRetryCount: 0, connectTimeoutMs: 20_000, defaultQueryTimeoutMs: 15_000,
      shouldIgnoreJid: jid => !privateJid(jid), getMessage: async () => undefined
    });
    socket = target;
    listen(target, 'creds.update', update => {
      Promise.resolve(store.saveCreds(update)).catch(() => {
        setState('error'); endSocket(target, 'WhatsApp session persistence failed.');
      });
    });
    listen(target, 'connection.update', update => {
      if (stopped || socket !== target) return;
      if (update.qr) {
        if (allowPairing && typeof onQr === 'function') onQr(update.qr);
        else { setState('needs_pairing'); endSocket(target, 'Private association is required.'); }
      }
      if (update.connection === 'open') {
        const ownNumber = /^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(target.user?.id ?? '')?.[1];
        if (expectedNumber && ownNumber !== expectedNumber) {
          setState('wrong_account'); endSocket(target, 'The associated account does not match the configured bot.'); return;
        }
        attempt = 0; connectedAt = Math.floor(Date.now() / 1000); setState('connected');
      } else if (update.connection === 'close') {
        const code = update.lastDisconnect?.error?.output?.statusCode;
        endSocket(target, 'WhatsApp connection closed.');
        setState('disconnected');
        if (code === baileys.DisconnectReason?.loggedOut || [401, 403, 411, 440, 500].includes(code)) setState('logged_out');
        else if (!stopped) scheduleReconnect();
      }
    });
    listen(target, 'messages.upsert', event => {
      if (state !== 'connected' || event.type !== 'notify' || event.requestId) return;
      for (const message of (event.messages ?? []).slice(0, 100)) {
        const claim = parseClaimMessage(message, connectedAt);
        if (!claim || inboundPending >= 32) continue;
        inboundPending++;
        Promise.resolve().then(() => onClaim(claim)).catch(noop).finally(() => inboundPending--);
      }
    });
    listen(target, 'messages.update', updates => {
      for (const update of updates ?? []) if ([3, 4, 5].includes(update.update?.status)) emitReceipt(update.key);
    });
    listen(target, 'message-receipt.update', updates => {
      for (const update of updates ?? []) if (update.receipt?.receiptTimestamp || update.receipt?.readTimestamp || update.receipt?.playedTimestamp) emitReceipt(update.key);
    });
  }
  async function connect() {
    if (connecting) return connecting;
    connecting = start().catch(error => {
      setState('error');
      throw error;
    }).finally(() => { connecting = undefined; });
    return connecting;
  }

  async function performSend({ recipient, webpPath, oggPath, kind, duration, signal, onHandoff }) {
    if (stopped || state !== 'connected' || !socket) throw failure('unavailable', 'WhatsApp is not connected.');
    if (!privateJid(recipient)) throw failure('invalid_recipient', 'Invalid WhatsApp conversation.');
    if (signal?.aborted) throw failure('expired', 'The transfer has expired.');
    if (!['static', 'animated'].includes(kind)) throw failure('invalid_media', 'Invalid sticker kind.');
    if (oggPath && (!soundEnabled || kind !== 'animated' || !Number.isFinite(duration) || duration <= 0 || duration > 6)) throw failure('unsupported_sound', 'Native sticker sound is not enabled.');
    const currentSocket = socket;
    let handedOff = false, messageId;
    const check = () => {
      if (signal?.aborted) throw failure('expired', 'The transfer has expired.');
      if (stopped || socket !== currentSocket || state !== 'connected') throw failure('unavailable', 'WhatsApp is not connected.');
    };
    try {
      const visual = await readFile(webpPath); check();
      if (visual.length > 500 * 1024) throw failure('invalid_media', 'Sticker size exceeds the transfer limit.');
      const options = { upload: currentSocket.waUploadToServer, mediaUploadTimeoutMs: 15_000, logger: silentLogger };
      let audio;
      if (oggPath) {
        const ogg = await readFile(oggPath); check();
        if (ogg.length > 512 * 1024 || !ogg.subarray(0, 4).equals(Buffer.from('OggS'))) throw failure('invalid_media', 'Invalid encoded sticker audio.');
        const prepared = await baileys.prepareWAMessageMedia({ audio: ogg, mimetype: 'audio/ogg; codecs=opus', seconds: Math.max(1, Math.ceil(duration)) }, options);
        check();
        if (!prepared.audioMessage) throw failure('invalid_media', 'Audio upload did not produce a message.');
        audio = { ...prepared.audioMessage, mimetype: 'audio/ogg; codecs=opus', seconds: Math.max(1, Math.ceil(duration)), ptt: true };
      }
      const prepared = await baileys.prepareWAMessageMedia({ sticker: visual, isAnimated: kind === 'animated', width: 512, height: 512 }, options);
      check();
      if (!prepared.stickerMessage) throw failure('invalid_media', 'Sticker upload did not produce a message.');
      const ownJid = recipient.endsWith('@lid') ? currentSocket.user?.lid ?? currentSocket.user?.id : currentSocket.user?.id;
      const generated = baileys.generateWAMessageFromContent(recipient, prepared, { userJid: ownJid });
      messageId = generated.key?.id;
      if (!messageId) throw failure('invalid_media', 'Missing outgoing message identity.');
      const relay = async () => {
        check();
        if (onHandoff) await onHandoff({ messageId });
        check();
        for (const [id, value] of sent) if (value.expiresAt <= Date.now()) sent.delete(id);
        if (sent.size >= 100) sent.delete(sent.keys().next().value);
        sent.set(messageId, { recipient, expiresAt: Date.now() + 10 * 60_000 });
        handedOff = true;
        await currentSocket.relayMessage(recipient, generated.message, { messageId });
        if (signal?.aborted) throw failure('delivery_unknown', 'The WhatsApp acknowledgement is unknown.', messageId);
        return { messageId };
      };
      return audio ? await withSoundSticker({ proto: baileys.proto, message: generated.message, audio }, relay) : await relay();
    } catch (error) {
      if (handedOff) throw failure('delivery_unknown', 'The WhatsApp acknowledgement is unknown.', messageId);
      if (['expired', 'unavailable', 'invalid_media', 'unsupported_sound', 'invalid_recipient'].includes(error?.code)) throw error;
      throw failure('unavailable', 'WhatsApp could not prepare this sticker.');
    }
  }

  return {
    connect,
    isReady: () => !stopped && state === 'connected' && !!socket,
    getState: () => state,
    send(options) {
      const operation = sendTail.then(() => performSend(options));
      sendTail = operation.catch(noop);
      return operation;
    },
    async close() {
      if (stopped) return;
      stopped = true; clearTimeout(reconnectTimer); reconnectTimer = undefined;
      endSocket(socket, 'WhatsApp bridge is stopping.');
      await connecting?.catch(noop);
      await sendTail;
      store?.close(); store = undefined; sent.clear(); setState('closed');
    }
  };
}
