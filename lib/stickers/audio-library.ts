import {MAX_AUDIO_SOURCE_SECONDS, registerAudioWork, type AudioTrack} from './audio';
import {readAudioLibraryRecords, updateAudioLibraryRecords} from './store';

export type SavedAudio = {id: string; name: string; blob: Blob; duration: number; createdAt: number; hash: string};
export type SavedAudioBackup = Omit<SavedAudio, 'blob'> & {mime: string; data: string};
export const MAX_SAVED_SOUNDS = 60;
export const MAX_AUDIO_LIBRARY_BYTES = 100 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const AUDIO_LIBRARY_CHANGED = 'zapstick-audio-library-changed';
const invalid = () => new Error('La bibliothèque de sons est invalide.');
const nameOf = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) || 'Mon son';

export function normalizeAudioLibrary(value: unknown): SavedAudio[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_SAVED_SOUNDS) throw invalid();
  const ids = new Set<string>(); let total = 0;
  return value.map(entry => {
    if (!entry || typeof entry !== 'object') throw invalid();
    const row = entry as SavedAudio;
    if (typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(row.id) || ids.has(row.id) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120 || /[\u0000-\u001f\u007f]/.test(row.name) || !(row.blob instanceof Blob) || !row.blob.size || row.blob.size > MAX_SOURCE_BYTES || !Number.isFinite(row.duration) || row.duration <= 0 || row.duration > MAX_AUDIO_SOURCE_SECONDS + .001 || !Number.isFinite(row.createdAt) || row.createdAt < 0 || typeof row.hash !== 'string' || !/^[a-f\d]{64}$/.test(row.hash)) throw invalid();
    total += row.blob.size; if (total > MAX_AUDIO_LIBRARY_BYTES) throw invalid();
    ids.add(row.id);
    return {id: row.id, name: row.name, blob: row.blob, duration: row.duration, createdAt: row.createdAt, hash: row.hash};
  });
}
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event(AUDIO_LIBRARY_CHANGED)); }
async function fingerprint(blob: Blob): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function loadAudioLibrary(): Promise<SavedAudio[]> { return normalizeAudioLibrary(await readAudioLibraryRecords()); }
export async function saveAudioToLibrary(track: AudioTrack, name = track.name, signal?: AbortSignal): Promise<SavedAudio> {
  if (!track.blob.size || track.blob.size > MAX_SOURCE_BYTES || !Number.isFinite(track.buffer.duration) || track.buffer.duration <= 0 || track.buffer.duration > MAX_AUDIO_SOURCE_SECONDS + .001) throw invalid();
  const controller = new AbortController(), abort = () => controller.abort();
  signal?.addEventListener('abort', abort, {once: true});
  const unregister = registerAudioWork(abort);
  const check = () => { if (signal?.aborted || controller.signal.aborted) throw new DOMException('Aborted', 'AbortError'); };
  try {
    check(); const hash = await fingerprint(track.blob); check();
    let saved: SavedAudio | undefined;
    await updateAudioLibraryRecords(current => {
      check();
      const entries = normalizeAudioLibrary(current), existing = entries.find(entry => entry.hash === hash);
      if (existing) { saved = existing; return entries; }
      if (entries.length >= MAX_SAVED_SOUNDS) throw new Error('Ta bibliothèque contient déjà 60 sons.');
      if (entries.reduce((size, entry) => size + entry.blob.size, 0) + track.blob.size > MAX_AUDIO_LIBRARY_BYTES) throw new Error('Ta bibliothèque de sons est pleine.');
      saved = {id: crypto.randomUUID(), name: nameOf(name), blob: track.blob, duration: track.buffer.duration, createdAt: Date.now(), hash};
      return [saved, ...entries];
    });
    if (!saved) throw new Error('Impossible d’enregistrer ce son sur cet appareil.');
    changed(); return saved;
  } finally { unregister(); signal?.removeEventListener('abort', abort); }
}
export async function renameSavedAudio(id: string, name: string): Promise<void> {
  await updateAudioLibraryRecords(current => normalizeAudioLibrary(current).map(entry => entry.id === id ? {...entry, name: nameOf(name)} : entry)); changed();
}
export async function removeSavedAudio(id: string): Promise<void> {
  await updateAudioLibraryRecords(current => normalizeAudioLibrary(current).filter(entry => entry.id !== id)); changed();
}

/** Explicit backup only; never uploads or changes the stored library. */
export async function serializeAudioLibrary(entries: readonly SavedAudio[]): Promise<SavedAudioBackup[]> {
  const sounds = normalizeAudioLibrary(entries), result: SavedAudioBackup[] = [];
  for (const {blob, ...entry} of sounds) {
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Impossible de lire les sons enregistrés.')); reader.readAsDataURL(blob); });
    result.push({...entry, mime: blob.type, data});
  }
  return result;
}
/** Validate before the user confirms restoration. No IndexedDB mutation here. */
export async function restoreAudioLibrary(value: unknown, signal?: AbortSignal): Promise<SavedAudio[]> {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SAVED_SOUNDS) throw invalid();
  let total = 0; const entries: SavedAudio[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.mime !== 'string' || item.mime.length > 100 || /[\u0000-\u001f\u007f]/.test(item.mime) || typeof item.data !== 'string') throw invalid();
    const prefix = `data:${item.mime || 'application/octet-stream'};base64,`;
    if (!item.data.startsWith(prefix) || item.data.length > prefix.length + 4 * Math.ceil(MAX_SOURCE_BYTES / 3)) throw invalid();
    const encoded = item.data.slice(prefix.length);
    if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw invalid();
    const decoded = atob(encoded), bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
    if (btoa(decoded) !== encoded) throw invalid();
    total += bytes.length; if (total > MAX_AUDIO_LIBRARY_BYTES) throw invalid();
    const entry = normalizeAudioLibrary([{...item, blob: new Blob([bytes], {type: item.mime})}])[0];
    if (await fingerprint(entry.blob) !== entry.hash) throw invalid();
    const {decodeAudio} = await import('./audio');
    const track = await decodeAudio(entry.blob, {name: entry.name, source: 'library', signal});
    if (Math.abs(track.buffer.duration - entry.duration) > .05) throw invalid();
    entries.push(entry);
  }
  return normalizeAudioLibrary(entries);
}
