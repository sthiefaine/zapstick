import {Agent} from 'undici';
import {createHash, timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BridgeError} from './config.mjs';

const invalid = (reason = 'structure') => { const error = new BridgeError('invalid_media', 422); error.reason = reason; return error; };
function metadata(message, maximum) {
  if (!message || message.invalid || !Buffer.isBuffer(message.mediaKey) && !(message.mediaKey instanceof Uint8Array)) throw invalid('metadata_key');
  const key = Buffer.from(message.mediaKey), digest = Buffer.from(message.fileSha256 ?? []), size = Number(message.fileLength ?? 0);
  if (key.length !== 32 || digest.length !== 32) throw invalid('metadata_key');
  // fileLength is optional in WhatsApp's protobuf. Actual downloaded bytes and
  // their SHA-256 remain mandatory and bounded even when it is omitted.
  if (!Number.isSafeInteger(size) || size < 0 || size > maximum) throw invalid('metadata_size');
  let directPath = message.directPath;
  if (!directPath && typeof message.url === 'string') {
    try { const url = new URL(message.url); if (url.protocol === 'https:' && url.hostname === 'mmg.whatsapp.net' && !url.username && !url.password && !url.port && !url.hash) directPath = url.pathname + url.search; } catch {}
  }
  if (typeof directPath !== 'string' || directPath.length > 2048 || !directPath.startsWith('/') || directPath.startsWith('//') || /[\x00-\x20\x7f\\]/.test(directPath)) throw invalid('metadata_path');
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
  let downloadFailure;
  const abort = () => { downloadFailure ??= invalid('timeout'); void agent.destroy(new Error('download_cancelled')).catch(() => {}); };
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
        if (code !== 200) { downloadFailure = invalid([403,404,410,429].includes(code) ? `http_${code}` : 'http'); stopped = true; stop(downloadFailure); return false; }
        for (let i = 0; i < values.length; i += 2) {
          const name = String(values[i]).toLowerCase(), value = String(values[i + 1]);
          if (name === 'content-encoding' && value !== 'identity' || name === 'content-length' && (!/^\d+$/.test(value) || Number(value) > limit)) {
            downloadFailure = invalid('response_size'); stopped = true; stop(downloadFailure); return false;
          }
        }
        return true;
      },
      onData(bytes) {
        size += bytes.length;
        if (size > limit) { downloadFailure = invalid('response_size'); stopped = true; stop(downloadFailure); return false; }
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
      if (size > maximum) throw invalid('response_size');
      parts.push(bytes);
    }
    const result = Buffer.concat(parts, size), digest = createHash('sha256').update(result).digest();
    if (source.fileLength > 0 && size !== source.fileLength || !timingSafeEqual(digest, source.fileSha256)) throw invalid('integrity');
    return result;
  } catch (error) {
    throw downloadFailure ?? (error?.reason ? error : invalid('transport'));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); stream?.destroy(); await agent.destroy().catch(() => {}); }
}

/** Native sound attachments do not all use the same container or duration.
 * Decode their first six seconds before aligning the visual and PCM together.
 * A private, seekable input also supports M4A with metadata after its audio. */
export async function decodeIncomingAudio({bytes, duration, signal}) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 512 * 1024) throw invalid('audio_size');
  if (!Number.isFinite(duration) || duration < 0 || duration > 6 || signal?.aborted) throw invalid('audio_duration');
  const channels = 2, maximum = 6 * 48000 * channels * 2;
  const directory = await mkdtemp(path.join(tmpdir(), 'zapstick-incoming-audio-'));
  try {
  const input = path.join(directory, 'source');
  await writeFile(input, bytes, {flag:'wx', mode:0o600});
  if (signal?.aborted) throw invalid('timeout');
  const pcm = await new Promise((resolve, reject) => {
    const args = ['-hide_banner','-loglevel','error','-nostdin','-max_alloc','16777216','-threads','1','-filter_threads','1','-protocol_whitelist','file,pipe','-format_whitelist','ogg,mov,mp3,wav,aac,matroska,webm','-probesize','524288','-analyzeduration','2000000','-i',input,'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1','-ar','48000','-ac',String(channels),'-t','6','-c:a','pcm_s16le','-f','s16le','pipe:1'];
    const child = spawn('ffmpeg', args, {shell: false, windowsHide: true, stdio: ['pipe','pipe','pipe']});
    let size = 0, diagnostics = 0, failure; const parts = [];
    const stop = () => { failure ??= invalid('audio_decode'); child.kill('SIGKILL'); };
    const timer = setTimeout(stop, 15_000); timer.unref();
    signal?.addEventListener('abort', stop, {once: true});
    child.on('error', () => { failure ??= invalid('audio_decode'); }); child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => { size += chunk.length; if (size > maximum) stop(); else parts.push(chunk); });
    child.stderr.on('data', chunk => { diagnostics += chunk.length; if (diagnostics > 8192) stop(); });
    child.once('close', code => { clearTimeout(timer); signal?.removeEventListener('abort', stop); if (failure || code !== 0 || !size || size % (channels * 2)) reject(failure ?? invalid('audio_decode')); else resolve(Buffer.concat(parts, size)); });
    child.stdin.end(); if (signal?.aborted) stop();
  });
  const milliseconds = Math.min(6000, Math.max(8, Math.round(duration * 1000), Math.ceil(pcm.length / (channels * 2 * 48))));
  const aligned = Buffer.alloc(milliseconds * 48 * channels * 2); pcm.copy(aligned);
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + aligned.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(48000 * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(aligned.length, 40);
  return {sound:Buffer.concat([header, aligned]), duration:milliseconds / 1000};
  } finally { await rm(directory, {recursive:true, force:true}); }
}
