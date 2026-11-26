import {spawn} from 'node:child_process';
import {constants} from 'node:fs';
import {open, unlink} from 'node:fs/promises';
import path from 'node:path';

export const MEDIA_LIMITS = Object.freeze({
  staticBytes: 100 * 1024,
  animatedBytes: 500 * 1024,
  soundBytes: Math.ceil(2.4 * 1024 * 1024),
  seconds: 6,
  soundSeconds: 6.1,
  frames: 750,
  opusBytes: 128 * 1024,
  encodeTimeoutMs: 15_000,
  diagnosticBytes: 8192,
});

export class MediaValidationError extends Error {
  constructor(code = 'invalid_media', message = 'Invalid sticker media.', statusCode = 422) {
    super(message);
    this.name = 'MediaValidationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const invalid = () => { throw new MediaValidationError(); };
const tooLarge = () => { throw new MediaValidationError('media_too_large', 'Sticker media exceeds its limit.', 413); };
const tag = (buffer, offset) => buffer.toString('ascii', offset, offset + 4);
const u24 = (buffer, offset) => buffer.readUIntLE(offset, 3);

function riff(buffer, format, limit) {
  if (!Buffer.isBuffer(buffer)) invalid();
  if (buffer.length > limit) tooLarge();
  if (buffer.length < 20 || tag(buffer, 0) !== 'RIFF' || tag(buffer, 8) !== format
    || buffer.readUInt32LE(4) !== buffer.length - 8) invalid();
}

function* chunks(buffer, start = 12, end = buffer.length) {
  for (let offset = start; offset < end;) {
    if (offset + 8 > end) invalid();
    const size = buffer.readUInt32LE(offset + 4), begin = offset + 8;
    const finish = begin + size, padded = finish + (size & 1);
    if (finish > end || padded > end || (size & 1) && buffer[finish] !== 0) invalid();
    yield {name: tag(buffer, offset), start: begin, end: finish, size};
    offset = padded;
  }
}

// Inspect the actual VP8/VP8L frame header, not only the canvas advertised by
// VP8X/ANMF. This parser intentionally accepts the bounded WebP subset Zapstick
// produces. It does not claim to decode or authenticate compressed pixel data.
function imageHeader(buffer, chunk) {
  const at = chunk.start;
  if (chunk.name === 'VP8L') {
    if (chunk.size < 6 || buffer[at] !== 0x2f) invalid();
    const bits = buffer.readUInt32LE(at + 1);
    if (bits >>> 29) invalid();
    return {width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, alpha: !!(bits & 0x10000000)};
  }
  if (chunk.name !== 'VP8 ' || chunk.size < 11) invalid();
  const frame = u24(buffer, at), partitionSize = frame >>> 5;
  if ((frame & 1) || ((frame >>> 1) & 7) > 3 || !(frame & 0x10)
    || partitionSize < 1 || partitionSize > chunk.size - 10
    || buffer[at + 3] !== 0x9d || buffer[at + 4] !== 1 || buffer[at + 5] !== 0x2a) invalid();
  const width = buffer.readUInt16LE(at + 6), height = buffer.readUInt16LE(at + 8);
  if ((width & 0xc000) || (height & 0xc000) || !width || !height) invalid();
  return {width, height, alpha: false};
}

function alphaHeader(buffer, chunk, width, height) {
  if (chunk.size < 2) invalid();
  const flags = buffer[chunk.start], compression = flags & 3;
  if ((flags & 0xc0) || compression > 1 || ((flags >>> 4) & 3) > 1) invalid();
  if (compression === 0 && chunk.size !== 1 + width * height) invalid();
}

function frameImage(buffer, start, end, width, height) {
  let image, alpha;
  for (const chunk of chunks(buffer, start, end)) {
    if (chunk.name === 'ALPH' && !alpha && !image) alpha = chunk;
    else if ((chunk.name === 'VP8 ' || chunk.name === 'VP8L') && !image) {
      image = imageHeader(buffer, chunk);
      if (alpha && chunk.name !== 'VP8 ') invalid();
    } else invalid();
  }
  if (!image || image.width !== width || image.height !== height) invalid();
  if (alpha) alphaHeader(buffer, alpha, width, height);
  return !!alpha || image.alpha;
}

function webp(buffer) {
  riff(buffer, 'WEBP', MEDIA_LIMITS.animatedBytes);
  let extension, image, alpha, anim = false, frames = 0, durationMs = 0;
  let hasAlpha = false, seenImage = false, trailingMetadata = false;
  const metadata = new Set();
  for (const chunk of chunks(buffer)) {
    if (chunk.name === 'VP8X') {
      if (extension || seenImage || metadata.size || chunk.start !== 20 || chunk.size !== 10) invalid();
      const flags = buffer[chunk.start];
      if ((flags & 0xc1) || buffer[chunk.start + 1] || buffer[chunk.start + 2] || buffer[chunk.start + 3]) invalid();
      extension = {flags, width: u24(buffer, chunk.start + 4) + 1, height: u24(buffer, chunk.start + 7) + 1};
      if (extension.width !== 512 || extension.height !== 512) invalid();
    } else if (chunk.name === 'ANIM') {
      if (!extension || !(extension.flags & 2) || anim || seenImage || trailingMetadata || chunk.size !== 6) invalid();
      anim = true;
    } else if (chunk.name === 'ANMF') {
      if (!anim || image || trailingMetadata || chunk.size < 24) invalid();
      const at = chunk.start, x = u24(buffer, at) * 2, y = u24(buffer, at + 3) * 2;
      const width = u24(buffer, at + 6) + 1, height = u24(buffer, at + 9) + 1;
      const delay = u24(buffer, at + 12);
      if (x + width > 512 || y + height > 512 || (buffer[at + 15] & 0xfc) || delay < 8) invalid();
      durationMs += delay;
      if (++frames > MEDIA_LIMITS.frames || durationMs > MEDIA_LIMITS.seconds * 1000) invalid();
      hasAlpha = frameImage(buffer, at + 16, chunk.end, width, height) || hasAlpha;
      seenImage = true;
    } else if (chunk.name === 'ALPH') {
      if (!extension || anim || (extension.flags & 2) || alpha || image || trailingMetadata) invalid();
      alpha = chunk;
    } else if (chunk.name === 'VP8 ' || chunk.name === 'VP8L') {
      if (image || anim || extension?.flags & 2 || trailingMetadata || (alpha && chunk.name !== 'VP8 ')) invalid();
      image = imageHeader(buffer, chunk);
      if (image.width !== 512 || image.height !== 512) invalid();
      if (alpha) alphaHeader(buffer, alpha, 512, 512);
      hasAlpha = !!alpha || image.alpha;
      seenImage = true;
    } else if (['ICCP', 'EXIF', 'XMP '].includes(chunk.name)) {
      if (!extension || !chunk.size || metadata.has(chunk.name) || (chunk.name === 'ICCP' && (seenImage || anim))
        || (chunk.name !== 'ICCP' && !seenImage)) invalid();
      metadata.add(chunk.name);
      if (chunk.name !== 'ICCP') trailingMetadata = true;
    } else invalid();
  }
  if (!seenImage || (anim && frames < 2) || (!anim && !image) || (!!(extension?.flags & 2) !== anim)) invalid();
  if (extension) {
    for (const [name, flag] of [['ICCP', 0x20], ['EXIF', 8], ['XMP ', 4]]) {
      if (!!(extension.flags & flag) !== metadata.has(name)) invalid();
    }
    // Zapstick's muxer conservatively advertises alpha even for opaque frames.
    if (hasAlpha && !(extension.flags & 0x10)) invalid();
  }
  if (!anim && buffer.length > MEDIA_LIMITS.staticBytes) tooLarge();
  return {kind: anim ? 'animated' : 'static', duration: durationMs / 1000};
}

function wav(buffer) {
  riff(buffer, 'WAVE', MEDIA_LIMITS.soundBytes);
  let format, frames;
  for (const chunk of chunks(buffer)) {
    if (chunk.name === 'fmt ' && !format && frames === undefined && chunk.size === 16) {
      const at = chunk.start, channels = buffer.readUInt16LE(at + 2), sampleRate = buffer.readUInt32LE(at + 4);
      const blockAlign = buffer.readUInt16LE(at + 12);
      if (buffer.readUInt16LE(at) !== 1 || buffer.readUInt16LE(at + 14) !== 16 || ![1, 2].includes(channels)
        || sampleRate < 8000 || sampleRate > 96000 || blockAlign !== channels * 2
        || buffer.readUInt32LE(at + 8) !== sampleRate * blockAlign) invalid();
      format = {channels, sampleRate, blockAlign};
    } else if (chunk.name === 'data' && format && frames === undefined && chunk.size && chunk.size % format.blockAlign === 0) {
      frames = chunk.size / format.blockAlign;
    } else invalid();
  }
  if (!format || frames === undefined || frames / format.sampleRate > MEDIA_LIMITS.soundSeconds) invalid();
  return {sampleRate: format.sampleRate, channels: format.channels, duration: frames / format.sampleRate, frames};
}

/** Validate the already-rendered result, never raw sources or editable layers. */
export function validateMedia({visual, sound} = {}) {
  const result = webp(visual);
  if (sound !== undefined) {
    if (result.kind !== 'animated') invalid();
    const audio = wav(sound);
    if (Math.abs(audio.duration - result.duration) > 1 / audio.sampleRate + 1e-9) invalid();
    result.sampleRate = audio.sampleRate;
    result.channels = audio.channels;
  }
  return result;
}

function encoderError(code, message, statusCode = 503) {
  const error = new Error(message);
  error.name = code === 'encoding_cancelled' ? 'AbortError' : 'MediaEncodingError';
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

async function readWav(filePath) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) invalid();
    if (stat.size > MEDIA_LIMITS.soundBytes) tooLarge();
    const parts = [];
    let size = 0;
    for (;;) {
      const bytes = Buffer.allocUnsafe(Math.min(64 * 1024, MEDIA_LIMITS.soundBytes + 1 - size));
      const {bytesRead} = await handle.read(bytes, 0, bytes.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > MEDIA_LIMITS.soundBytes) tooLarge();
      parts.push(bytes.subarray(0, bytesRead));
    }
    const buffer = Buffer.concat(parts, size);
    return {buffer, ...wav(buffer)};
  } finally { await handle.close(); }
}

// Check the encoder's actual Ogg stream, including its final granule position.
// Opus pre-skip is not audible duration and must not shift the user's montage.
function checkOpus(buffer, audio) {
  let offset = 0, sequence = 0, serial, preSkip, finalGranule;
  while (offset < buffer.length) {
    if (offset + 27 > buffer.length || tag(buffer, offset) !== 'OggS' || buffer[offset + 4] !== 0) invalid();
    const flags = buffer[offset + 5], granule = buffer.readBigUInt64LE(offset + 6);
    const stream = buffer.readUInt32LE(offset + 14), page = buffer.readUInt32LE(offset + 18);
    const segments = buffer[offset + 26], body = offset + 27 + segments;
    if (flags & 0xf8 || body > buffer.length || page !== sequence++) invalid();
    let bytes = 0;
    for (let i = offset + 27; i < body; i++) bytes += buffer[i];
    if (body + bytes > buffer.length) invalid();
    if (serial === undefined) {
      if (flags !== 2 || bytes !== 19 || buffer.toString('ascii', body, body + 8) !== 'OpusHead'
        || buffer[body + 8] !== 1 || buffer[body + 9] !== audio.channels
        || buffer.readUInt32LE(body + 12) !== 48000 || buffer[body + 18] !== 0) invalid();
      serial = stream;
      preSkip = buffer.readUInt16LE(body + 10);
    } else if (stream !== serial || flags & 2) invalid();
    offset = body + bytes;
    if (flags & 4) {
      if (offset !== buffer.length) invalid();
      finalGranule = granule;
    }
  }
  const expected = Math.round(audio.duration * 48000);
  if (finalGranule === undefined || finalGranule < BigInt(preSkip) || finalGranule > BigInt(Number.MAX_SAFE_INTEGER)
    || Math.abs(Number(finalGranule) - preSkip - expected) > 1) invalid();
}

let encoding = false;

/** Local WAV → Ogg/Opus only. FFmpeg never receives a filename, URL, filter or
 * argument supplied by a visitor. The output path must not already exist. */
export async function encodeOpus({inputPath, outputPath, signal} = {}) {
  if (typeof inputPath !== 'string' || typeof outputPath !== 'string' || !path.isAbsolute(inputPath)
    || !path.isAbsolute(outputPath) || path.resolve(inputPath) === path.resolve(outputPath)) invalid();
  if (signal?.aborted) throw encoderError('encoding_cancelled', 'Audio encoding cancelled.', 499);
  if (encoding) throw encoderError('encoding_busy', 'Audio encoder is busy.');
  encoding = true;
  let output, created = false, committed = false;
  try {
    const audio = await readWav(inputPath);
    if (signal?.aborted) throw encoderError('encoding_cancelled', 'Audio encoding cancelled.', 499);
    output = await open(outputPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    const encoded = await new Promise((resolve, reject) => {
      const args = [
        '-hide_banner', '-loglevel', 'error', '-nostdin', '-max_alloc', '16777216',
        '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1',
        '-protocol_whitelist', 'pipe', '-f', 'wav', '-i', 'pipe:0',
        '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1',
        '-c:a', 'libopus', '-application', 'audio', '-b:a', '64000', '-vbr', 'on',
        '-ar', '48000', '-ac', String(audio.channels), '-frame_duration', '20',
        '-threads', '1', '-t', '6.1', '-f', 'ogg', 'pipe:1',
      ];
      const child = spawn('ffmpeg', args, {shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
      let failure, size = 0, diagnostics = 0;
      const parts = [];
      const stop = error => {
        failure ??= error;
        child.kill('SIGKILL');
      };
      const abort = () => stop(encoderError('encoding_cancelled', 'Audio encoding cancelled.', 499));
      const timer = setTimeout(() => stop(encoderError('encoding_timeout', 'Audio encoding timed out.')), MEDIA_LIMITS.encodeTimeoutMs);
      signal?.addEventListener('abort', abort, {once: true});
      child.on('error', error => {
        failure ??= encoderError(error.code === 'ENOENT' ? 'encoder_unavailable' : 'encoding_failed', 'Audio encoder unavailable.');
      });
      child.stdin.on('error', () => {}); // An early FFmpeg exit closes its input.
      child.stdout.on('data', bytes => {
        size += bytes.length;
        if (size > MEDIA_LIMITS.opusBytes) stop(encoderError('encoding_failed', 'Encoded audio exceeds its limit.'));
        else parts.push(bytes);
      });
      child.stderr.on('data', bytes => {
        // Count and discard diagnostics; neither paths nor content reach logs.
        diagnostics += bytes.length;
        if (diagnostics > MEDIA_LIMITS.diagnosticBytes) stop(encoderError('encoding_failed', 'Audio encoder diagnostic limit exceeded.'));
      });
      child.once('close', code => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (failure) reject(failure);
        else if (code !== 0 || !size) reject(encoderError('encoding_failed', 'Audio encoding failed.'));
        else resolve(Buffer.concat(parts, size));
      });
      if (signal?.aborted) abort();
      else child.stdin.end(audio.buffer);
    });
    try { checkOpus(encoded, audio); }
    catch { throw encoderError('encoding_failed', 'Encoded audio is invalid.'); }
    if (signal?.aborted) throw encoderError('encoding_cancelled', 'Audio encoding cancelled.', 499);
    await output.writeFile(encoded);
    await output.sync();
    if (signal?.aborted) throw encoderError('encoding_cancelled', 'Audio encoding cancelled.', 499);
    committed = true;
    return {mime: 'audio/ogg; codecs=opus', duration: audio.duration, sampleRate: 48000, channels: audio.channels, bytes: encoded.length};
  } finally {
    try { await output?.close(); }
    finally {
      try { if (created && !committed) await unlink(outputPath); }
      finally { encoding = false; }
    }
  }
}
