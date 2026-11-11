import {GIF_EXPORT_LIMITS, GifExportError, checkGifExportSignal, gifOutputSize} from './gif-export-core';

export type WebpAnimationFrame = {x: number; y: number; width: number; height: number; durationMs: number; dispose: boolean; blend: boolean; start: number; end: number};
export type WebpAnimation = {width: number; height: number; loopCount: number; background: readonly [number, number, number, number]; frames: WebpAnimationFrame[]; colorProfile?: {start: number; end: number}};
type Chunk = {name: string; start: number; payload: number; end: number; paddedEnd: number};
const fourCC = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
const u24 = (bytes: Uint8Array, at: number) => bytes[at] | bytes[at + 1] << 8 | bytes[at + 2] << 16;
const u32 = (bytes: Uint8Array, at: number) => new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0, true);
function* chunks(bytes: Uint8Array, start: number, end: number): Generator<Chunk> {
  for (let at = start; at < end;) {
    if (at + 8 > end) throw new GifExportError('invalid');
    const size = u32(bytes, at + 4), payload = at + 8, chunkEnd = payload + size, paddedEnd = chunkEnd + size % 2;
    if (chunkEnd > end || paddedEnd > end) throw new GifExportError('invalid');
    yield {name: fourCC(bytes, at), start: at, payload, end: chunkEnd, paddedEnd};at = paddedEnd;
  }
}
function checkFrameBitstream(bytes: Uint8Array, chunk: Chunk, frame: WebpAnimationFrame): void {
  let width = 0, height = 0;
  if (chunk.name === 'VP8L') {
    if (chunk.end - chunk.payload < 5 || bytes[chunk.payload] !== 0x2f) throw new GifExportError('invalid');
    const bits = u32(bytes, chunk.payload + 1);
    if (bits >>> 29) throw new GifExportError('invalid');
    width = (bits & 0x3fff) + 1;height = (bits >>> 14 & 0x3fff) + 1;
  } else {
    const at = chunk.payload;
    if (chunk.end - at < 10 || bytes[at] & 1 || bytes[at + 3] !== 0x9d || bytes[at + 4] !== 1 || bytes[at + 5] !== 0x2a) throw new GifExportError('invalid');
    width = (bytes[at + 6] | bytes[at + 7] << 8) & 0x3fff;height = (bytes[at + 8] | bytes[at + 9] << 8) & 0x3fff;
  }
  if (width !== frame.width || height !== frame.height) throw new GifExportError('invalid');
}

/** Parse only bounded metadata; encoded ANMF data remains a view of one input
 * buffer. Useful for later animation operations as well as GIF export. */
export function parseWebpAnimation(bytes: Uint8Array): WebpAnimation {
  if (bytes.length > GIF_EXPORT_LIMITS.inputBytes) throw new GifExportError('too-large');
  if (bytes.length < 12 || fourCC(bytes, 0) !== 'RIFF' || fourCC(bytes, 8) !== 'WEBP') throw new GifExportError('format');
  const end = u32(bytes, 4) + 8;
  if (end !== bytes.length) throw new GifExportError('invalid');
  let width = 0, height = 0, animated = false, hasAnimationHeader = false, loopCount = 0;
  let background: WebpAnimation['background'] = [0, 0, 0, 0], colorProfile: WebpAnimation['colorProfile'];
  const frames: WebpAnimationFrame[] = [];
  for (const chunk of chunks(bytes, 12, end)) {
    const length = chunk.end - chunk.payload, at = chunk.payload;
    if (chunk.name === 'VP8X') {
      if (length !== 10 || width) throw new GifExportError('invalid');
      animated = !!(bytes[at] & 2);width = u24(bytes, at + 4) + 1;height = u24(bytes, at + 7) + 1;gifOutputSize(width, height);
    } else if (chunk.name === 'ANIM') {
      if (length !== 6 || hasAnimationHeader) throw new GifExportError('invalid');
      hasAnimationHeader = true;background = [bytes[at + 2], bytes[at + 1], bytes[at], bytes[at + 3]];
      loopCount = bytes[at + 4] | bytes[at + 5] << 8;
    } else if (chunk.name === 'ICCP') {
      if (length > 256 * 1024) throw new GifExportError('too-large');
      colorProfile = {start: chunk.start, end: chunk.paddedEnd};
    } else if (chunk.name === 'ANMF') {
      if (length <= 16 || !width || !hasAnimationHeader) throw new GifExportError('invalid');
      const frame = {x: u24(bytes, at) * 2, y: u24(bytes, at + 3) * 2, width: u24(bytes, at + 6) + 1, height: u24(bytes, at + 9) + 1,
        durationMs: u24(bytes, at + 12) || 100, dispose: !!(bytes[at + 15] & 1), blend: !(bytes[at + 15] & 2), start: at + 16, end: chunk.end};
      if (frame.x + frame.width > width || frame.y + frame.height > height) throw new GifExportError('invalid');
      let images = 0;
      for (const sub of chunks(bytes, frame.start, frame.end)) if (sub.name === 'VP8 ' || sub.name === 'VP8L') { images++;checkFrameBitstream(bytes, sub, frame); }
      if (images !== 1) throw new GifExportError('invalid');
      frames.push(frame);
      if (frames.length > GIF_EXPORT_LIMITS.frames || width * height * frames.length > GIF_EXPORT_LIMITS.totalPixels) throw new GifExportError('too-large');
    }
  }
  if (!animated || !hasAnimationHeader || frames.length < 2) throw new GifExportError('not-animated');
  if (frames.reduce((sum, frame) => sum + frame.durationMs, 0) > GIF_EXPORT_LIMITS.durationMs) throw new GifExportError('too-large');
  return {width, height, loopCount, background, frames, colorProfile};
}

/** Rewrap one ANMF payload as a genuine still WebP. Native bitmap decoders can
 * decode it even when ImageDecoder / animated WebP decoding is unavailable. */
export function webpFrameBlob(bytes: Uint8Array, animation: WebpAnimation, frame: WebpAnimationFrame): Blob {
  const imageChunks: Uint8Array[] = [];let alpha = false;
  for (const chunk of chunks(bytes, frame.start, frame.end)) {
    if (['ALPH', 'VP8 ', 'VP8L'].includes(chunk.name)) imageChunks.push(bytes.subarray(chunk.start, chunk.paddedEnd));
    if (chunk.name === 'ALPH' || chunk.name === 'VP8L' && chunk.end - chunk.payload >= 5 && !!(bytes[chunk.payload + 4] & 16)) alpha = true;
  }
  const profile = animation.colorProfile ? bytes.subarray(animation.colorProfile.start, animation.colorProfile.end) : undefined;
  const extension = new Uint8Array(18);extension.set([86, 80, 56, 88, 10, 0, 0, 0]);extension[8] = (alpha ? 16 : 0) | (profile ? 32 : 0);
  for (const [offset, value] of [[12, frame.width - 1], [15, frame.height - 1]]) { extension[offset] = value & 255;extension[offset + 1] = value >>> 8 & 255;extension[offset + 2] = value >>> 16 & 255; }
  const length = 4 + extension.length + (profile?.length ?? 0) + imageChunks.reduce((sum, chunk) => sum + chunk.length, 0), header = new Uint8Array(12);
  header.set([82, 73, 70, 70]);new DataView(header.buffer).setUint32(4, length, true);header.set([87, 69, 66, 80], 8);
  return new Blob([header, extension, ...(profile ? [profile] : []), ...imageChunks] as BlobPart[], {type: 'image/webp'});
}

export type DecodedWebpFrame = {canvas: OffscreenCanvas; width: number; height: number; index: number; durationMs: number};
export type WebpFrameDecodeOptions = {strategy?: 'native' | 'bitmap'; signal?: AbortSignal};
export async function supportsNativeWebpDecoder(): Promise<boolean> {
  try { return typeof ImageDecoder !== 'undefined' && await ImageDecoder.isTypeSupported('image/webp'); } catch { return false; }
}
/** Sequential reusable decoder. The same output surface is yielded each time;
 * consume/copy it before advancing. Every bitmap / VideoFrame is closed promptly. */
export async function* decodeWebpFrames(bytes: Uint8Array, animation: WebpAnimation, {strategy = 'bitmap', signal}: WebpFrameDecodeOptions = {}): AsyncGenerator<DecodedWebpFrame> {
  checkGifExportSignal(signal);
  const size = gifOutputSize(animation.width, animation.height), output = new OffscreenCanvas(size.width, size.height), target = output.getContext('2d', {willReadFrequently: true});
  if (!target) throw new GifExportError('unsupported');
  if (strategy === 'native') {
    const decoder = new ImageDecoder({data: bytes as Uint8Array<ArrayBuffer>, type: 'image/webp', preferAnimation: true, desiredWidth: size.width, desiredHeight: size.height});
    try {
      await decoder.tracks.ready;
      if ((decoder.tracks.selectedTrack?.frameCount ?? 0) !== animation.frames.length) throw new GifExportError('decode');
      for (let index = 0; index < animation.frames.length; index++) {
        checkGifExportSignal(signal);
        const result = await decoder.decode({frameIndex: index, completeFramesOnly: true});
        try { target.clearRect(0, 0, size.width, size.height);target.drawImage(result.image, 0, 0, size.width, size.height); }
        finally { result.image.close(); }
        yield {canvas: output, ...size, index, durationMs: animation.frames[index].durationMs};
      }
    } finally { decoder.close();output.width = output.height = 0; }
    return;
  }
  const surface = new OffscreenCanvas(animation.width, animation.height), context = surface.getContext('2d');
  if (!context || typeof createImageBitmap !== 'function') throw new GifExportError('unsupported');
  function background(x: number, y: number, width: number, height: number) {
    context!.clearRect(x, y, width, height);
    const [r, g, b, a] = animation.background;
    if (a) { context!.fillStyle = `rgba(${r},${g},${b},${a / 255})`;context!.fillRect(x, y, width, height); }
  }
  background(0, 0, animation.width, animation.height);
  let previous: WebpAnimationFrame | undefined;
  try {
    for (let index = 0; index < animation.frames.length; index++) {
      checkGifExportSignal(signal);
      const frame = animation.frames[index];
      if (previous?.dispose) background(previous.x, previous.y, previous.width, previous.height);
      if (!frame.blend) context.clearRect(frame.x, frame.y, frame.width, frame.height);
      const bitmap = await createImageBitmap(webpFrameBlob(bytes, animation, frame));
      try {
        if (bitmap.width !== frame.width || bitmap.height !== frame.height) throw new GifExportError('invalid');
        context.drawImage(bitmap, frame.x, frame.y);
      } finally { bitmap.close(); }
      target.clearRect(0, 0, size.width, size.height);target.drawImage(surface, 0, 0, size.width, size.height);previous = frame;
      yield {canvas: output, ...size, index, durationMs: frame.durationMs};
    }
  } finally { surface.width = surface.height = output.width = output.height = 0; }
}
