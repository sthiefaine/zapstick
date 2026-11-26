import {Agent} from 'undici';
import {createHash, timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {BridgeError} from './config.mjs';

const invalid = () => new BridgeError('invalid_media', 422);
function metadata(message, maximum) {
  if (!message || message.invalid || !Buffer.isBuffer(message.mediaKey) && !(message.mediaKey instanceof Uint8Array)) throw invalid();
  const key = Buffer.from(message.mediaKey), digest = Buffer.from(message.fileSha256 ?? []), size = Number(message.fileLength);
  if (key.length !== 32 || digest.length !== 32 || !Number.isSafeInteger(size) || size <= 0 || size > maximum) throw invalid();
  const directPath = message.directPath;
  if (typeof directPath !== 'string' || directPath.length > 2048 || !directPath.startsWith('/') || /[\x00-\x20\x7f\\]/.test(directPath)) throw invalid();
  return {mediaKey: key, fileSha256: digest, fileLength: size, directPath};
}

/** Baileys rc14 ignores generic fetch timeout/signal options. Its dispatcher is
 * bounded here and buffers the encrypted body before giving it to the SDK.
 * Thus a network error cannot leave its source Readable with an unhandled error.
 * Only the fixed WhatsApp media host is allowed, including after redirects. */
export async function downloadIncomingMedia(sdk, message, type, maximum, signal, agentFactory = options => new Agent(options)) {
  const source = metadata(message, maximum), limit = maximum + 64;
  if (signal?.aborted) throw new BridgeError('cancelled', 499);
  const agent = agentFactory({connections: 1, pipelining: 1, connect: {timeout: 5000}, maxHeaderSize: 8192});
  const abort = () => { void agent.destroy(new Error('download_cancelled')).catch(() => {}); };
  signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(abort, 15_000); timer.unref();
  const dispatcher = {dispatch(options, handler) {
    if (String(options.origin) !== 'https://mmg.whatsapp.net' || options.method !== 'GET') throw invalid();
    let status, headers, statusText, size = 0, stopped = false, stop;
    const parts = [];
    return agent.dispatch({...options, headersTimeout: 10_000, bodyTimeout: 10_000}, {
      onConnect(cancel, context) { stop = cancel; handler.onConnect?.(cancel, context); },
      onHeaders(code, values, _resume, text) {
        status = code; headers = values; statusText = text;
        if (code !== 200) { stopped = true; stop(new Error('media_unavailable')); return false; }
        for (let i = 0; i < values.length; i += 2) {
          const name = String(values[i]).toLowerCase(), value = String(values[i + 1]);
          if (name === 'content-encoding' && value !== 'identity' || name === 'content-length' && (!/^\d+$/.test(value) || Number(value) > limit)) {
            stopped = true; stop(new Error('media_too_large')); return false;
          }
        }
        return true;
      },
      onData(bytes) {
        size += bytes.length;
        if (size > limit) { stopped = true; stop(new Error('media_too_large')); return false; }
        parts.push(Buffer.from(bytes)); return true;
      },
      onComplete(trailers) {
        if (stopped) return;
        handler.onHeaders(status, headers, () => {}, statusText);
        handler.onData(Buffer.concat(parts, size)); handler.onComplete(trailers);
      },
      onError(error) { handler.onError(error); },
    });
  }};
  let stream;
  try {
    stream = await sdk.downloadContentFromMessage({mediaKey: source.mediaKey, directPath: source.directPath}, type, {host: 'mmg.whatsapp.net', options: {dispatcher}});
    const parts = []; let size = 0;
    for await (const bytes of stream) {
      if (signal?.aborted) throw new BridgeError('cancelled', 499);
      size += bytes.length;
      if (size > maximum) throw invalid();
      parts.push(bytes);
    }
    const result = Buffer.concat(parts, size), digest = createHash('sha256').update(result).digest();
    if (size !== source.fileLength || !timingSafeEqual(digest, source.fileSha256)) throw invalid();
    return result;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); stream?.destroy(); await agent.destroy().catch(() => {}); }
}

function opusInfo(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 512 * 1024) throw invalid();
  let at = 0, sequence = 0, serial, skip, channels, granule;
  while (at < bytes.length) {
    if (at + 27 > bytes.length || bytes.toString('ascii', at, at + 4) !== 'OggS' || bytes[at + 4] !== 0) throw invalid();
    const flags = bytes[at + 5], stream = bytes.readUInt32LE(at + 14), segments = bytes[at + 26], body = at + 27 + segments;
    if (flags & 0xf8 || bytes.readUInt32LE(at + 18) !== sequence++ || body > bytes.length) throw invalid();
    let length = 0;
    for (let i = at + 27; i < body; i++) length += bytes[i];
    if (body + length > bytes.length) throw invalid();
    if (serial === undefined) {
      if (flags !== 2 || length !== 19 || bytes.toString('ascii', body, body + 8) !== 'OpusHead' || bytes[body + 8] !== 1 || ![1, 2].includes(bytes[body + 9]) || bytes[body + 18] !== 0) throw invalid();
      serial = stream; skip = bytes.readUInt16LE(body + 10); channels = bytes[body + 9];
    } else if (serial !== stream || flags & 2) throw invalid();
    at = body + length;
    if (flags & 4) { if (at !== bytes.length) throw invalid(); granule = bytes.readBigUInt64LE(body - segments - 21); }
  }
  if (granule === undefined || granule <= BigInt(skip) || granule - BigInt(skip) > BigInt(Math.ceil(6.1 * 48000))) throw invalid();
  return {channels, duration: Number(granule - BigInt(skip)) / 48000};
}

export async function decodeIncomingOpus({bytes, duration, signal}) {
  const {channels} = opusInfo(bytes);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 6 || signal?.aborted) throw invalid();
  const frames = Math.round(duration * 48000), expected = frames * channels * 2;
  const pcm = await new Promise((resolve, reject) => {
    const args = ['-hide_banner','-loglevel','error','-nostdin','-max_alloc','16777216','-threads','1','-filter_threads','1','-protocol_whitelist','pipe','-f','ogg','-i','pipe:0','-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-ar','48000','-ac',String(channels),'-af',`apad=whole_len=${frames},atrim=end_sample=${frames}`,'-c:a','pcm_s16le','-f','s16le','pipe:1'];
    const child = spawn('ffmpeg', args, {shell: false, windowsHide: true, stdio: ['pipe','pipe','pipe']});
    let size = 0, diagnostics = 0, failure; const parts = [];
    const stop = () => { failure ??= invalid(); child.kill('SIGKILL'); };
    const timer = setTimeout(stop, 15_000); timer.unref();
    signal?.addEventListener('abort', stop, {once: true});
    child.on('error', () => { failure ??= invalid(); }); child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => { size += chunk.length; if (size > expected) stop(); else parts.push(chunk); });
    child.stderr.on('data', chunk => { diagnostics += chunk.length; if (diagnostics > 8192) stop(); });
    child.once('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', stop); if (failure || code !== 0 || size !== expected) reject(failure ?? invalid()); else resolve(Buffer.concat(parts, size)); });
    if (signal?.aborted) stop(); else child.stdin.end(bytes);
  });
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(48000 * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
