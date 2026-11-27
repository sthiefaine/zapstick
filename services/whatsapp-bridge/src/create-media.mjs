import path from 'node:path';
import {mkdtemp, writeFile, unlink, rm} from 'node:fs/promises';
import sharp from 'sharp';
import {MEDIA_LIMITS, MediaValidationError, validateIncomingSticker, validateMedia, encodeOpus} from './media.mjs';

// One creation is admitted at a time by the bot. Keep libvips' native cache and
// worker count bounded alongside the existing serialized audio codec.
sharp.concurrency(1);
sharp.cache({memory: 16, files: 0, items: 0});
const PIXELS = 80_000_000;
const MAX_MS = MEDIA_LIMITS.seconds * 1000;
const invalid = () => new MediaValidationError();

function* chunks(buffer) {
  for (let at = 12; at < buffer.length;) {
    const size = buffer.readUInt32LE(at + 4), start = at + 8, end = start + size;
    yield {name: buffer.toString('ascii', at, at + 4), start, end, bytes: buffer.subarray(at, end + (size & 1))};
    at = end + (size & 1);
  }
}
function chunk(name, bytes) {
  const header = Buffer.alloc(8); header.write(name); header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes, ...(bytes.length & 1 ? [Buffer.alloc(1)] : [])]);
}
function riff(parts) {
  const body = Buffer.concat([Buffer.from('WEBP'), ...parts]), header = Buffer.alloc(8);
  header.write('RIFF'); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Exact millisecond durations, including unusually fast native frames. */
function retime(delays, duration) {
  const target = Math.max(delays.length * 8, Math.min(MAX_MS, Math.round(duration)));
  const base = delays.map(value => Math.max(8, Math.round(value || 100)));
  const sum = base.reduce((total, value) => total + value, 0);
  if (sum <= target) { base[base.length - 1] += target - sum; return base; }
  const available = target - base.length * 8, weight = sum - base.length * 8;
  const result = base.map(value => 8 + Math.floor((value - 8) * available / weight));
  result[result.length - 1] += target - result.reduce((total, value) => total + value, 0);
  return result;
}

// libwebp can fold identical frames into one still. Native sound stickers must
// remain animated, and the strict outgoing validator requires two frames.
function animation(bytes, targetMs) {
  const entries = [...chunks(bytes)], frames = entries.filter(item => item.name === 'ANMF');
  if (!frames.length) {
    const image = entries.filter(item => ['ALPH', 'VP8 ', 'VP8L'].includes(item.name));
    if (!image.length) throw invalid();
    const extension = Buffer.alloc(10); extension[0] = 0x12;
    extension.writeUIntLE(511, 4, 3); extension.writeUIntLE(511, 7, 3);
    const delays = retime([8, 8], Math.max(16, targetMs));
    return riff([chunk('VP8X', extension), chunk('ANIM', Buffer.alloc(6)), ...delays.map(delay => {
      const frame = Buffer.alloc(16); frame.writeUIntLE(511, 6, 3); frame.writeUIntLE(511, 9, 3);
      frame.writeUIntLE(delay, 12, 3); frame[15] = 2;
      return chunk('ANMF', Buffer.concat([frame, ...image.map(item => item.bytes)]));
    })]);
  }
  const payloads = frames.map(item => Buffer.from(bytes.subarray(item.start, item.end)));
  if (payloads.length === 1) {
    const duplicate = Buffer.from(payloads[0]); duplicate[15] = 2;
    payloads.push(duplicate);
  }
  const delays = retime(payloads.map(frame => frame.readUIntLE(12, 3)), Math.max(16, targetMs));
  let frameIndex = 0;
  return riff(entries.flatMap(item => {
    if (item.name === 'ANMF') {
      const payload = payloads[frameIndex]; payload.writeUIntLE(delays[frameIndex++], 12, 3);
      const result = [chunk('ANMF', payload)];
      if (frames.length === 1) { payloads[1].writeUIntLE(delays[1], 12, 3); result.push(chunk('ANMF', payloads[1])); }
      return result;
    }
    if (item.name === 'ANIM') { const header = Buffer.from(bytes.subarray(item.start, item.end)); header.writeUInt16LE(0, 4); return [chunk('ANIM', header)]; }
    return ['VP8X', 'ICCP'].includes(item.name) ? [item.bytes] : [];
  }));
}

function wavData(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 44 || bytes.length > MEDIA_LIMITS.soundBytes
    || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
    || bytes.readUInt32LE(4) !== bytes.length - 8) throw invalid();
  let format, pcm;
  for (const item of chunks(bytes)) {
    const size = item.end - item.start;
    if (item.end > bytes.length) throw invalid();
    if (item.name === 'fmt ' && !format && pcm === undefined && size === 16) {
      const at = item.start, channels = bytes.readUInt16LE(at + 2), rate = bytes.readUInt32LE(at + 4);
      if (bytes.readUInt16LE(at) !== 1 || bytes.readUInt16LE(at + 14) !== 16 || ![1, 2].includes(channels)
        || rate < 8000 || rate > 96000 || bytes.readUInt16LE(at + 12) !== channels * 2
        || bytes.readUInt32LE(at + 8) !== rate * channels * 2) throw invalid();
      format = {channels, rate};
    } else if (item.name === 'data' && format && pcm === undefined && size && size % (format.channels * 2) === 0) pcm = bytes.subarray(item.start, item.end);
    else throw invalid();
  }
  if (!format || !pcm || pcm.length / (format.rate * format.channels * 2) > 6) throw invalid();
  return {...format, pcm, duration: pcm.length / (format.rate * format.channels * 2)};
}
function alignSound(audio, milliseconds) {
  const pcm = Buffer.alloc(Math.round(milliseconds / 1000 * audio.rate) * audio.channels * 2);
  audio.pcm.copy(pcm);
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
  header.writeUInt16LE(audio.channels, 22); header.writeUInt32LE(audio.rate, 24);
  header.writeUInt32LE(audio.rate * audio.channels * 2, 28); header.writeUInt16LE(audio.channels * 2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Render only the visual chosen in /create. A sound is added solely when it
 * was supplied separately; an original sticker's sound is never reused here.
 * All paths are private children of the caller's temporary directory. */
export async function prepareCreatedSticker({visual, sound, dir, signal} = {}) {
  if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw invalid();
  const incoming = validateIncomingSticker(visual), audio = sound === undefined ? undefined : wavData(sound);
  const controller = new AbortController();
  let timedOut = false, directory, completed = false;
  const abort = () => controller.abort(); signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000); timer.unref();
  const check = () => {
    if (signal?.aborted || controller.signal.aborted) {
      const error = new Error('Sticker preparation stopped.'); error.code = timedOut ? 'encoding_timeout' : 'cancelled'; throw error;
    }
  };
  try {
    check();
    const metadata = await sharp(visual, {animated: true, limitInputPixels: PIXELS, failOn: 'warning'}).metadata();
    const pages = metadata.pages || 1, height = metadata.pageHeight || metadata.height;
    if (metadata.format !== 'webp' || !metadata.width || !height || metadata.width * height * pages > PIXELS) throw invalid();
    const originalDelays = incoming.kind === 'animated' ? [...chunks(visual)].filter(item => item.name === 'ANMF').map(item => visual.readUIntLE(item.start + 12, 3) || 100) : [];
    const delays = originalDelays.length ? retime(originalDelays, Math.min(MAX_MS, originalDelays.reduce((sum, value) => sum + Math.max(8, value), 0))) : [];
    const animated = incoming.kind === 'animated' || !!audio;
    const targetMs = animated ? Math.min(MAX_MS, Math.max(16, delays.reduce((sum, value) => sum + value, 0), Math.ceil((audio?.duration || 0) * 1000))) : 0;
    if (delays.length) delays[delays.length - 1] += targetMs - delays.reduce((sum, value) => sum + value, 0);
    let encoded;
    for (const quality of [80, 60, 40, 24]) {
      check();
      const image = sharp(visual, {animated: true, limitInputPixels: PIXELS, failOn: 'warning'})
        .timeout({seconds: 8}).resize(512, 512, {fit: 'contain', background: '#00000000'})
        .webp({quality, alphaQuality: 90, effort: 2, loop: 0, ...(delays.length ? {delay: delays} : {})});
      const stop = () => image.destroy(); controller.signal.addEventListener('abort', stop, {once: true});
      try { encoded = await image.toBuffer(); } finally { controller.signal.removeEventListener('abort', stop); }
      check();
      if (animated) encoded = animation(encoded, targetMs);
      if (encoded.length <= (animated ? MEDIA_LIMITS.animatedBytes : MEDIA_LIMITS.staticBytes)) break;
    }
    const aligned = audio ? alignSound(audio, targetMs) : undefined;
    const result = validateMedia({visual: encoded, ...(aligned ? {sound: aligned} : {})});
    check();
    directory = await mkdtemp(path.join(dir, 'created-'));
    const webpPath = path.join(directory, 'sticker.webp');
    await writeFile(webpPath, encoded, {flag: 'wx', mode: 0o600});
    let oggPath;
    if (aligned) {
      const wavPath = path.join(directory, 'sound.wav'); oggPath = path.join(directory, 'sound.ogg');
      await writeFile(wavPath, aligned, {flag: 'wx', mode: 0o600});
      try { await encodeOpus({inputPath: wavPath, outputPath: oggPath, signal: controller.signal}); }
      finally { await unlink(wavPath).catch(() => {}); }
    }
    check(); completed = true;
    return {webpPath, ...(oggPath ? {oggPath} : {}), kind: result.kind, duration: result.duration};
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
    if (directory && !completed) await rm(directory, {recursive: true, force: true});
  }
}
