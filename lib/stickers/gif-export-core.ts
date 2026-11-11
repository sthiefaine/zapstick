/** Limits bound local decoding, the encoder's output buffer and worker lifetime. */
export const GIF_EXPORT_LIMITS = {
  inputBytes: 20 * 1024 * 1024,
  outputBytes: 12 * 1024 * 1024,
  sourcePixels: 2_097_152,
  sourceSide: 4096,
  totalPixels: 120_000_000,
  frames: 300,
  durationMs: 30_000,
  outputSize: 512,
  timeoutMs: 90_000,
} as const;
export const GIF_EXPORT_MESSAGES = {
  unsupported: 'L’export GIF nécessite un navigateur récent. Essaie Chrome, Edge ou Safari à jour.',
  format: 'Ce format ne peut pas être exporté en GIF. Crée d’abord un sticker animé.',
  invalid: 'Cette animation est illisible. Essaie un autre média.',
  'not-animated': 'Ce média ne contient pas d’animation.',
  'too-large': 'Cette animation est trop volumineuse. Essaie une animation plus courte.',
  output: 'Le GIF dépasse 12 Mo. Essaie une animation plus courte.',
  timing: 'Cette animation est trop rapide pour un export GIF fidèle.',
  decode: 'Impossible de décoder cette animation. Essaie un autre média.',
  timeout: 'La préparation du GIF prend trop de temps. Essaie une animation plus courte.',
  cancelled: 'Préparation du GIF annulée.',
  busy: 'Un GIF est déjà en préparation. Patiente un instant.',
} as const;
export type GifExportErrorCode = keyof typeof GIF_EXPORT_MESSAGES;
export class GifExportError extends Error {
  constructor(public readonly code: GifExportErrorCode) { super(GIF_EXPORT_MESSAGES[code]);this.name = code === 'cancelled' ? 'AbortError' : 'GifExportError'; }
}
export function checkGifExportSignal(signal?: AbortSignal): void { if (signal?.aborted) throw new GifExportError('cancelled'); }
export function gifOutputSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new GifExportError('invalid');
  if (width * height > GIF_EXPORT_LIMITS.sourcePixels || Math.max(width, height) > GIF_EXPORT_LIMITS.sourceSide) throw new GifExportError('too-large');
  const ratio = Math.min(1, GIF_EXPORT_LIMITS.outputSize / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio))};
}
/** GIF stores centiseconds. Round cumulative endpoints so 72 × 83.33ms keeps
 * its six-second duration rather than losing time on every individual frame. */
export function gifCentisecondDelays(durationsMs: readonly number[]): number[] {
  if (!durationsMs.length || durationsMs.length > GIF_EXPORT_LIMITS.frames) throw new GifExportError('too-large');
  if (durationsMs.some(value => !Number.isFinite(value) || value < 0)) throw new GifExportError('invalid');
  const durations = durationsMs.map(value => value || 100), totalMs = durations.reduce((sum, value) => sum + value, 0);
  if (totalMs > GIF_EXPORT_LIMITS.durationMs) throw new GifExportError('too-large');
  const totalCs = Math.round(totalMs / 10);
  if (totalCs < durations.length) throw new GifExportError('timing');
  let elapsedMs = 0, previousCs = 0;
  return durations.map((duration, index) => {
    elapsedMs += duration;
    const endpoint = Math.min(totalCs - (durations.length - index - 1), Math.max(previousCs + 1, Math.round(elapsedMs / 10)));
    const delay = endpoint - previousCs;previousCs = endpoint;return delay;
  });
}
/** WebP counts total plays; Netscape GIF counts extra iterations (zero = forever). */
export function gifRepeatFromWebp(loopCount: number): number { return loopCount === 0 ? 0 : loopCount <= 1 ? -1 : loopCount - 1; }
export function isGifBytes(bytes: Uint8Array): boolean { return bytes.length >= 13 && String.fromCharCode(...bytes.subarray(0, 6)) === 'GIF89a' || bytes.length >= 13 && String.fromCharCode(...bytes.subarray(0, 6)) === 'GIF87a'; }

/** Validate a GIF without inflating pixels or allocating an object per block.
 * Existing GIFs can then be returned losslessly with their original loop/delays. */
export function inspectGifAnimation(bytes: Uint8Array): {width: number; height: number; frames: number; durationMs: number} {
  if (!isGifBytes(bytes)) throw new GifExportError('format');
  if (bytes.length > GIF_EXPORT_LIMITS.inputBytes) throw new GifExportError('too-large');
  const read16 = (at: number) => bytes[at] | bytes[at + 1] << 8;
  const width = read16(6), height = read16(8);gifOutputSize(width, height);
  let at = 13 + (bytes[10] & 128 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0), frames = 0, durationMs = 0, pendingDelay = 100;
  const requireBytes = (count: number) => { if (at + count > bytes.length) throw new GifExportError('invalid'); };
  function subBlocks() {
    while (true) { requireBytes(1);const length = bytes[at++];if (!length) return;requireBytes(length);at += length; }
  }
  while (at < bytes.length) {
    const marker = bytes[at++];
    if (marker === 0x3b) { if (frames < 2) throw new GifExportError('not-animated');return {width, height, frames, durationMs}; }
    if (marker === 0x21) {
      requireBytes(1);const label = bytes[at++];
      if (label === 0xf9) {
        requireBytes(6);if (bytes[at] !== 4 || bytes[at + 5] !== 0) throw new GifExportError('invalid');
        pendingDelay = read16(at + 2) * 10 || 100;at += 6;
      } else subBlocks();
    } else if (marker === 0x2c) {
      requireBytes(9);
      const x = read16(at), y = read16(at + 2), frameWidth = read16(at + 4), frameHeight = read16(at + 6), packed = bytes[at + 8];at += 9;
      if (!frameWidth || !frameHeight || x + frameWidth > width || y + frameHeight > height) throw new GifExportError('invalid');
      if (packed & 128) { const paletteBytes = 3 * 2 ** ((packed & 7) + 1);requireBytes(paletteBytes);at += paletteBytes; }
      requireBytes(1);const codeSize = bytes[at++];if (codeSize < 1 || codeSize > 8) throw new GifExportError('invalid');subBlocks();
      frames++;durationMs += pendingDelay;pendingDelay = 100;
      if (frames > GIF_EXPORT_LIMITS.frames || width * height * frames > GIF_EXPORT_LIMITS.totalPixels || durationMs > GIF_EXPORT_LIMITS.durationMs) throw new GifExportError('too-large');
    } else throw new GifExportError('invalid');
  }
  throw new GifExportError('invalid');
}
