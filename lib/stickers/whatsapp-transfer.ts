import type {Locale} from '@/lib/i18n/config';
import type {Collection, Sticker} from './types';

export const WHATSAPP_RECEIPTS_KEY = 'zapstick-whatsapp-transfers-v1';
const RETURN_KEY = 'zapstick-whatsapp-return-v1';
const TTL = 600_000, RETENTION = 86_400_000, MAX_RECORDS = 20;
const ID = /^[A-Za-z0-9_-]{22}$/, SECRET = /^[A-Za-z0-9_-]{43}$/;
const STATES = ['awaiting_message', 'queued', 'processing', 'sending', 'accepted', 'delivered', 'delivery_unknown', 'failed', 'cancelled', 'expired'] as const;
export type WhatsAppState = typeof STATES[number];
export type WhatsAppTransfer = {id: string; state: WhatsAppState; expiresAt: number; claimCode?: string; waUrl?: string; error?: string};
export type WhatsAppAvailability = {enabled: boolean; ready: boolean; soundEnabled: boolean};
type Receipt = {id: string; receipt: string; fingerprint: string; createdAt: number; expiresAt: number; locale: Locale; attempted: boolean; state?: WhatsAppState};
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Options = {signal?: AbortSignal; fresh?: boolean; beforePrepare?: () => Promise<void>};
const terminal = new Set<WhatsAppState>(['accepted', 'delivered', 'delivery_unknown', 'failed', 'cancelled', 'expired']);
export function isWhatsAppTransferTerminal(state: WhatsAppState) { return terminal.has(state); }
export class WhatsAppTransferError extends Error {
  constructor(readonly code: string, readonly status = 0) { super(code); this.name = 'WhatsAppTransferError'; }
}
const abortError = () => new DOMException('Aborted', 'AbortError');
function assertActive(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
/** Capture the current immutable snapshot now and preserve ordering with later edits. */
export function saveWhatsAppSnapshot(queue: {current: Promise<void>}, snapshot: Collection, persist: (value: Collection) => Promise<void>): Promise<void> {
  const write = queue.current.catch(() => {}).then(() => persist(snapshot));
  queue.current = write;
  return write;
}
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function transferValue(value: unknown, id: string): WhatsAppTransfer {
  const data = value as WhatsAppTransfer;
  if (!data || data.id !== id || !STATES.includes(data.state) || !Number.isFinite(data.expiresAt)) throw new WhatsAppTransferError('unavailable');
  if (data.state === 'awaiting_message') {
    try {
      const url = new URL(data.waUrl || '');
      if (!ID.test(data.claimCode || '') || url.protocol !== 'https:' || url.hostname !== 'wa.me' || url.username || url.password || url.port || url.hash || !/^\/[1-9]\d{6,14}$/.test(url.pathname) || ![`ZAP ${data.claimCode}`, `Sticker ZAP ${data.claimCode}`].includes(url.searchParams.get('text') || '') || [...url.searchParams.keys()].some(key => key !== 'text')) throw new Error();
    } catch { throw new WhatsAppTransferError('unavailable'); }
  }
  return {id: data.id, state: data.state, expiresAt: data.expiresAt, ...(data.state === 'awaiting_message' ? {claimCode: data.claimCode, waUrl: data.waUrl} : {}), ...(typeof data.error === 'string' ? {error: data.error} : {})};
}

/** Only capabilities are persisted here. Media and collection backups never contain these records. */
export function createWhatsAppTransferClient({fetchImpl = fetch, getStorage = () => localStorage, cryptoImpl = globalThis.crypto, now = Date.now}: {fetchImpl?: typeof fetch; getStorage?: () => StorageLike; cryptoImpl?: Crypto; now?: () => number} = {}) {
  const preparations = new Map<string, Promise<WhatsAppTransfer>>(), controllers = new Set<AbortController>();
  let generation = 0;
  function read(): Receipt[] {
    try {
      const raw = getStorage().getItem(WHATSAPP_RECEIPTS_KEY);
      if (!raw) return [];
      if (raw.length > 16_384) throw new Error();
      const value = JSON.parse(raw);
      if (value.version !== 1 || !Array.isArray(value.receipts) || value.receipts.length > MAX_RECORDS) throw new Error();
      return value.receipts.filter((item: Receipt) => item && ID.test(item.id) && SECRET.test(item.receipt) && /^[a-f0-9]{64}$/.test(item.fingerprint) && Number.isFinite(item.createdAt) && item.createdAt > now() - RETENTION && Number.isFinite(item.expiresAt) && typeof item.attempted === 'boolean' && ['fr', 'en', 'pt-BR', 'es', 'de', 'zh-CN', 'ja', 'ru'].includes(item.locale));
    } catch { throw new WhatsAppTransferError('storage'); }
  }
  function write(records: Receipt[]) {
    try { getStorage().setItem(WHATSAPP_RECEIPTS_KEY, JSON.stringify({version: 1, receipts: records})); }
    catch { throw new WhatsAppTransferError('storage'); }
  }
  function update(record: Receipt, opGeneration: number) {
    if (opGeneration !== generation) throw abortError();
    const records = read(), index = records.findIndex(item => item.id === record.id);
    if (index < 0) { for (let at = records.length - 1; at >= 0; at--) if (records[at].state && ['accepted', 'delivered', 'failed', 'cancelled', 'expired'].includes(records[at].state!) || records[at].state !== 'delivery_unknown' && records[at].expiresAt < now() - 60_000) records.splice(at, 1); if (records.length >= MAX_RECORDS) throw new WhatsAppTransferError('busy'); records.push(record); }
    else records[index] = record;
    write(records);
  }
  async function fingerprint(visual: Blob, sound?: Blob) {
    const hashes = await Promise.all([visual, sound].map(async blob => blob ? new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', await blob.arrayBuffer())) : new Uint8Array(32)));
    const joined = new Uint8Array(64); joined.set(hashes[0]); joined.set(hashes[1], 32);
    return Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', joined)), value => value.toString(16).padStart(2, '0')).join('');
  }
  async function request(record: Receipt, method: 'GET' | 'DELETE' | 'POST', signal?: AbortSignal, body?: FormData) {
    assertActive(signal);
    const deadline = AbortSignal.timeout(22_000);
    const response = await fetchImpl('/api/whatsapp/transfers' + (method === 'POST' ? '' : '/' + record.id), {method, headers: {Authorization: 'Bearer ' + record.receipt}, ...(body ? {body} : {}), signal: signal ? AbortSignal.any([signal, deadline]) : deadline, cache: 'no-store', credentials: 'same-origin', redirect: 'error'});
    const value = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      if (response.status === 410 && value.error === 'expired' && method !== 'POST') return {id: record.id, state: 'expired' as const, expiresAt: record.expiresAt};
      throw new WhatsAppTransferError(typeof value.error === 'string' ? value.error : 'unavailable', response.status);
    }
    return transferValue(value, record.id);
  }
  async function status(signal?: AbortSignal): Promise<WhatsAppAvailability> {
    const deadline = AbortSignal.timeout(8000);
    const response = await fetchImpl('/api/whatsapp/status', {signal: signal ? AbortSignal.any([signal, deadline]) : deadline, cache: 'no-store', credentials: 'same-origin', redirect: 'error'});
    if (!response.ok) throw new WhatsAppTransferError('unavailable', response.status);
    const value = await response.json() as Record<string, unknown> | null;
    return {enabled: value?.enabled === true, ready: value?.ready === true, soundEnabled: value?.soundEnabled === true};
  }
  async function get(id: string, signal?: AbortSignal) {
    const record = read().find(item => item.id === id);
    if (!record) throw new WhatsAppTransferError('not_found', 404);
    const opGeneration = generation, value = await request(record, 'GET', signal);
    update({...record, expiresAt: value.expiresAt, state: value.state}, opGeneration);
    return value;
  }
  async function resume(sticker: Sticker, signal?: AbortSignal) {
    if (!sticker.blob) return null;
    const key = await fingerprint(sticker.blob, sticker.sound?.blob); assertActive(signal);
    const record = read().find(item => item.fingerprint === key);
    if (!record) return null;
    try { return await get(record.id, signal); }
    catch (error) { if (error instanceof WhatsAppTransferError && error.status === 404) return null; throw error; }
  }
  async function prepare(sticker: Sticker, locale: Locale, {signal, fresh = false, beforePrepare}: Options = {}) {
    const opGeneration = generation;
    const visual = sticker.blob, sound = sticker.sound?.blob;
    if (!visual || !sticker.isSticker || sticker.mime !== 'image/webp' || visual.type !== 'image/webp' || sound && (sticker.kind !== 'animated' || sound.type !== 'audio/wav')) throw new WhatsAppTransferError('invalid');
    const key = await fingerprint(visual, sound); assertActive(signal); if (opGeneration !== generation) throw abortError();
    const pending = preparations.get(key); if (pending) return pending;
    const controller = new AbortController(), combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    controllers.add(controller);
    const work = (async () => {
      await beforePrepare?.(); assertActive(combined); if (opGeneration !== generation) throw abortError();
      let record = read().find(item => item.fingerprint === key);
      if (record) {
        try {
          const recovered = await get(record.id, combined);
          if (!fresh || !['accepted', 'delivered', 'failed', 'cancelled', 'expired'].includes(recovered.state)) return recovered;
          write(read().filter(item => item.id !== record!.id)); record = undefined;
        } catch (error) {
          if (!(error instanceof WhatsAppTransferError) || error.status !== 404) throw error;
          // A lost POST must be retried with the SAME capability, not a new transfer.
        }
      }
      if (!record) {
        record = {id: base64url(cryptoImpl.getRandomValues(new Uint8Array(16))), receipt: base64url(cryptoImpl.getRandomValues(new Uint8Array(32))), fingerprint: key, locale, createdAt: now(), expiresAt: now() + TTL, attempted: false};
        update(record, opGeneration);
      }
      assertActive(combined);
      record = {...record, attempted: true}; update(record, opGeneration);
      const body = new FormData(); body.append('manifest', JSON.stringify({version: 1, id: record.id, locale: record.locale})); body.append('visual', visual, 'visual.webp'); if (sound) body.append('sound', sound, 'sound.wav');
      const value = await request(record, 'POST', combined, body);
      update({...record, expiresAt: value.expiresAt, state: value.state}, opGeneration); return value;
    })();
    preparations.set(key, work);
    try { return await work; }
    finally { if (preparations.get(key) === work) preparations.delete(key); controllers.delete(controller); }
  }
  async function cancel(id: string, signal?: AbortSignal) {
    const record = read().find(item => item.id === id);
    if (!record) throw new WhatsAppTransferError('not_found', 404);
    const opGeneration = generation, value = await request(record, 'DELETE', signal);
    update({...record, state: value.state}, opGeneration); return value;
  }
  async function cancelFor(sticker: Sticker, signal?: AbortSignal) {
    if (!sticker.blob) return null;
    const key = await fingerprint(sticker.blob, sticker.sound?.blob);
    const record = read().find(item => item.fingerprint === key);
    if (!record) return null;
    return cancel(record.id, signal);
  }
  async function clear() {
    const records = (() => { try { return read(); } catch { return []; } })();
    generation++; for (const controller of controllers) controller.abort(); preparations.clear();
    const signal = AbortSignal.timeout(2000);
    try {
      let at = 0;
      await Promise.all(Array.from({length: Math.min(2, records.length)}, async () => {
        while (at < records.length && !signal.aborted) { const record = records[at++]; try { await request(record, 'DELETE', signal); } catch { /* The absolute server TTL remains the fallback. */ } }
      }));
    } finally { try { getStorage().removeItem(WHATSAPP_RECEIPTS_KEY); getStorage().removeItem(RETURN_KEY); } catch { /* Storage may be unavailable during browser clearing. */ } }
  }
  function rememberReturn(stickerId: string) {
    if (!stickerId || stickerId.length > 200) return;
    try { getStorage().setItem(RETURN_KEY, JSON.stringify({version: 1, stickerId, at: now()})); } catch { /* Optional navigation restoration must not block opening WhatsApp. */ }
  }
  function consumeReturn(): string | null {
    try {
      const raw = getStorage().getItem(RETURN_KEY); getStorage().removeItem(RETURN_KEY);
      if (!raw || raw.length > 1024) return null;
      const value = JSON.parse(raw);
      return value.version === 1 && typeof value.stickerId === 'string' && value.stickerId.length <= 200 && Number.isFinite(value.at) && value.at <= now() && value.at > now() - TTL ? value.stickerId : null;
    } catch { return null; }
  }
  return {status, prepare, resume, get, cancel, cancelFor, clear, rememberReturn, consumeReturn};
}
export const whatsAppTransferClient = createWhatsAppTransferClient();
export const clearWhatsAppTransfers = () => whatsAppTransferClient.clear();
