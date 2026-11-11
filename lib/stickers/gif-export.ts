import {GIF_EXPORT_LIMITS, GIF_EXPORT_MESSAGES, GifExportError, checkGifExportSignal, type GifExportErrorCode} from './gif-export-core';
export {GifExportError} from './gif-export-core';
export type {GifExportErrorCode} from './gif-export-core';

let active = false;
export type GifExportOptions = {signal?: AbortSignal; onProgress?: (percent: number) => void};
/** Real local encoding, including already-created / older animated WebP stickers.
 * The worker and gifenc load only on demand. Cancellation terminates decoding and
 * encoding immediately; no source media, overlays or frames leave the device. */
export async function exportAnimatedGif(blob: Blob, {signal, onProgress}: GifExportOptions = {}): Promise<Blob> {
  checkGifExportSignal(signal);
  if (active) throw new GifExportError('busy');
  if (blob.size > GIF_EXPORT_LIMITS.inputBytes) throw new GifExportError('too-large');
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new GifExportError('unsupported');
  active = true;
  try {
    const progressCallback = (value: number) => { try {onProgress?.(value);} catch {/* UI callbacks cannot strand a running worker. */} };
    progressCallback(0);
    return await new Promise<Blob>((resolve, reject) => {
      let worker: Worker;
      try { worker = new Worker(new URL('./gif-export.worker.ts', import.meta.url), {type: 'module'}); }
      catch { reject(new GifExportError('unsupported'));return; }
      let finished = false, progress = 0;
      const finish = (error?: Error, result?: Blob) => {
        if (finished) return;finished = true;clearTimeout(timer);signal?.removeEventListener('abort', aborted);worker.onmessage = worker.onerror = worker.onmessageerror = null;worker.terminate();
        if (error) reject(error);else if (result) {progressCallback(100);resolve(result);}else reject(new GifExportError('decode'));
      };
      const aborted = () => finish(new GifExportError('cancelled'));
      const timer = setTimeout(() => finish(new GifExportError('timeout')), GIF_EXPORT_LIMITS.timeoutMs);
      worker.onmessage = ({data}: MessageEvent<{type: string; percent?: number; blob?: Blob; code?: GifExportErrorCode}>) => {
        if (finished) return;
        if (data.type === 'progress') { progress = Math.max(progress, Math.min(99, data.percent ?? 0));progressCallback(progress);return; }
        if (data.type === 'result' && data.blob?.type === 'image/gif') finish(undefined, data.blob);
        else finish(new GifExportError(data.code && Object.hasOwn(GIF_EXPORT_MESSAGES, data.code) ? data.code : 'decode'));
      };
      worker.onerror = () => finish(new GifExportError('decode'));
      worker.onmessageerror = () => finish(new GifExportError('decode'));
      signal?.addEventListener('abort', aborted, {once: true});
      if (signal?.aborted) {aborted();return;}
      try { worker.postMessage({blob}); } catch { finish(new GifExportError('decode')); }
    });
  } finally { active = false; }
}
