import { frameIndexAt, gifFrameTimings } from './timeline';
import type { ParsedFrame, ParsedGif } from 'gifuct-js';

export type AnimationPreview = {
 duration: number;
 thumbnails: string[];
 drawAt?: (canvas: HTMLCanvasElement, time: number) => Promise<void>;
 dispose: () => void;
};
const abortError = () => new DOMException('Aborted', 'AbortError');
const yieldFrame = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function resize(canvas: HTMLCanvasElement, width: number, height: number, maximum: number) {
 const ratio = Math.min(1, maximum / Math.max(width, height));
 canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
}
function waitFor(element: HTMLVideoElement, event: 'loadeddata' | 'seeked', signal: AbortSignal): Promise<void> {
 return new Promise((resolve, reject) => {
  const timeout = setTimeout(() => finish(new Error('La lecture vidéo prend trop de temps.')), 10000);
  function cleanup() { clearTimeout(timeout); element.removeEventListener(event, done); element.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); }
  function finish(error?: Error) { cleanup(); if (error) reject(error); else resolve(); }
  const done = () => finish(), failed = () => finish(new Error('Cette vidéo ne peut pas être lue.')), aborted = () => finish(abortError());
  element.addEventListener(event, done, { once: true }); element.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true });
  if (signal.aborted) aborted();
 });
}
async function videoPreview(blob: Blob, signal: AbortSignal): Promise<AnimationPreview> {
 const video = document.createElement('video'), url = URL.createObjectURL(blob), canvas = document.createElement('canvas');
 video.muted = true; video.playsInline = true; video.preload = 'auto';
 try {
  const loaded = waitFor(video, 'loadeddata', signal); video.src = url; await loaded;
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Durée vidéo invalide.');
  resize(canvas, video.videoWidth, video.videoHeight, 120);
  const ctx = canvas.getContext('2d')!, thumbnails: string[] = [];
  for (let i = 0; i < 8; i++) {
   if (signal.aborted) throw abortError();
   const time = Math.min(Math.max(0, duration - .01), duration * i / 7);
   if (Math.abs(video.currentTime - time) > .001) { const sought = waitFor(video, 'seeked', signal); video.currentTime = time; await sought; }
   ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); thumbnails.push(canvas.toDataURL('image/webp', .65));
  }
  return { duration, thumbnails, dispose() {} };
 } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); canvas.width = canvas.height = 0; }
}

async function gifPreview(blob: Blob, signal: AbortSignal, withThumbnails = true): Promise<AnimationPreview> {
 const { parseGIF, decompressFrame } = await import('gifuct-js');
 let gif: ParsedGif | null = parseGIF(await blob.arrayBuffer());
 const width = gif.lsd.width, height = gif.lsd.height;
 let frames = gif.frames.filter((frame): frame is Extract<ParsedGif['frames'][number], { image: unknown }> => 'image' in frame);
 if (!frames.length) throw new Error('GIF vide.');
 if (!width || !height || width * height > 1920 * 1080 || frames.length * width * height > 80_000_000)
  throw new Error('Ce GIF est trop volumineux à animer. Essaie un GIF plus court ou choisis « Image fixe ».');
 const { ends, duration } = gifFrameTimings(frames.map(frame => (frame.gce?.delay || 10) * 10));
 const surface = document.createElement('canvas'), patch = document.createElement('canvas'), thumb = document.createElement('canvas');
 surface.width = width; surface.height = height; resize(thumb, width, height, 120);
 const ctx = surface.getContext('2d')!, thumbnailContext = thumb.getContext('2d')!;
 let rendered = -1, previous: Pick<ParsedFrame, 'dims' | 'disposalType'> | undefined, snapshot: ImageData | undefined, disposed = false;
 let queue: Promise<void> = Promise.resolve(), request = 0;
 const reset = () => { ctx.clearRect(0, 0, width, height); rendered = -1; previous = undefined; snapshot = undefined; };
 async function compose(index: number, current: number) {
  if (index < rendered) reset();
  while (rendered < index) {
   if (signal.aborted || disposed || current !== request) throw abortError();
   if (previous?.disposalType === 2) ctx.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height);
   else if (previous?.disposalType === 3 && snapshot) ctx.putImageData(snapshot, 0, 0);
   const frame = decompressFrame(frames[rendered + 1], gif!.gct, true);
   snapshot = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : undefined;
   patch.width = frame.dims.width; patch.height = frame.dims.height;
   patch.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height), 0, 0);
   ctx.drawImage(patch, frame.dims.left, frame.dims.top);
   previous = { dims: frame.dims, disposalType: frame.disposalType }; rendered++;
   if (rendered % 8 === 0) await yieldFrame();
  }
 }
 const dispose = () => { disposed = true; request++; snapshot = undefined; previous = undefined; frames = []; gif = null; surface.width = surface.height = patch.width = patch.height = thumb.width = thumb.height = 0; };
 try {
  const thumbnails: string[] = [];
  for (let i = 0; withThumbnails && i < 8; i++) {
   await compose(frameIndexAt(ends, Math.max(0, duration * i / 7 - .001)), request);
   thumbnailContext.clearRect(0, 0, thumb.width, thumb.height); thumbnailContext.drawImage(surface, 0, 0, thumb.width, thumb.height); thumbnails.push(thumb.toDataURL('image/webp', .65));
  }
  reset(); thumb.width = thumb.height = 0;
  return {
   duration, thumbnails, dispose,
   drawAt(canvas, time) {
    const current = ++request;
    queue = queue.catch(() => {}).then(async () => {
     if (disposed || signal.aborted || current !== request) return;
     await compose(frameIndexAt(ends, time), current);
     if (disposed || current !== request) return;
     if (!canvas.width || !canvas.height) resize(canvas, width, height, 512);
     const context = canvas.getContext('2d')!; context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(surface, 0, 0, canvas.width, canvas.height);
    });
    return queue;
   },
  };
 } catch (error) { dispose(); throw error; }
}
/** Decodes a local Blob only; keeps eight tiny thumbnails and one GIF compositing surface. */
export async function createAnimationPreview(blob: Blob, signal: AbortSignal, options?: { thumbnails?: boolean }): Promise<AnimationPreview> {
 if (signal.aborted) throw abortError();
 return blob.type === 'image/gif' ? gifPreview(blob, signal, options?.thumbnails !== false) : videoPreview(blob, signal);
}
