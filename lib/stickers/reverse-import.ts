import type {Sticker, StickerSound} from './types';
import {inferMediaKind} from './media-kind';
import {validateStickerSound} from './store';

const MAX_REPLY = 4 * 1024 * 1024;
function media(value: unknown, mime: string, maximum: number): Blob {
  if (!value || typeof value !== 'object') throw new Error('Impossible de charger ce média.');
  const file = value as {mime?: unknown; data?: unknown};
  if (file.mime !== mime || typeof file.data !== 'string' || !file.data || file.data.length > 4 * Math.ceil(maximum / 3) || file.data.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new Error('Impossible de charger ce média.');
  const decoded = atob(file.data);
  if (!decoded.length || decoded.length > maximum || btoa(decoded) !== file.data) throw new Error('Impossible de charger ce média.');
  return new Blob([Uint8Array.from(decoded, char => char.charCodeAt(0))], {type: mime});
}

export async function importWhatsAppSticker(token: string, name: string, soundName: string, signal: AbortSignal): Promise<Sticker> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Code expiré.');
  const response = await fetch('/api/whatsapp/reverse/' + token, {signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]), cache: 'no-store', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer'});
  if (!response.ok) throw new Error(response.status === 404 || response.status === 410 ? 'Code expiré.' : 'Impossible de charger ce média.');
  if (Number(response.headers.get('content-length')) > MAX_REPLY || !response.body) throw new Error('Impossible de charger ce média.');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > MAX_REPLY) { await reader.cancel(); throw new Error('Impossible de charger ce média.'); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const value = JSON.parse(new TextDecoder().decode(bytes));
  if (value?.version !== 1 || !['static', 'animated'].includes(value.kind) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) throw new Error('Code expiré.');
  const blob = media(value.visual, 'image/webp', 500 * 1024);
  const kind = await inferMediaKind(blob);
  if (kind !== value.kind) throw new Error('Impossible de charger ce média.');
  let sound: StickerSound | undefined;
  if (value.sound !== undefined) {
    if (kind !== 'animated') throw new Error('Impossible de charger ce média.');
    sound = {blob: media(value.sound, 'audio/wav', Math.ceil(2.4 * 1024 * 1024)), duration: value.sound.duration, name: soundName};
    await validateStickerSound(sound);
  }
  signal.throwIfAborted();
  return {id: crypto.randomUUID(), name, packId: '', kind, mime: 'image/webp', blob, favorite: false, createdAt: Date.now(), isSticker: true, ...(sound ? {sound} : {})};
}
