import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile, writeFile, mkdtemp, rm, access, chmod, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MEDIA_LIMITS, MediaValidationError, validateMedia, encodeOpus} from '../src/media.mjs';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const lossy = await readFile(path.join(fixtures, 'sticker-lossy.webp'));
const lossless = await readFile(path.join(fixtures, 'sticker-lossless.webp'));
const editedMix = await readFile(path.join(fixtures, 'two-excerpts.wav'));
const ffmpegAvailable = spawnSync('ffmpeg', ['-hide_banner', '-version'], {stdio: 'ignore'}).status === 0;
const ffprobeAvailable = spawnSync('ffprobe', ['-hide_banner', '-version'], {stdio: 'ignore'}).status === 0;

function chunk(name, bytes) {
  const header = Buffer.alloc(8);
  header.write(name);header.writeUInt32LE(bytes.length, 4);
  return Buffer.concat([header, bytes, ...(bytes.length & 1 ? [Buffer.alloc(1)] : [])]);
}
function riff(format, entries) {
  const payload = Buffer.concat([Buffer.from(format), ...entries]);
  const header = Buffer.alloc(8);header.write('RIFF');header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}
function entries(buffer) {
  const chunks = [];
  for (let offset = 12; offset < buffer.length;) {
    const name = buffer.toString('ascii', offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    chunks.push({name, bytes: buffer.subarray(offset + 8, offset + 8 + size)});
    offset += 8 + size + (size & 1);
  }
  return chunks;
}
function extension(flags = 0x12, width = 512, height = 512) {
  const bytes = Buffer.alloc(10);bytes[0] = flags;
  bytes.writeUIntLE(width - 1, 4, 3);bytes.writeUIntLE(height - 1, 7, 3);
  return chunk('VP8X', bytes);
}
function stillChunks(buffer = lossy) {
  return entries(buffer).filter(({name}) => ['ALPH', 'VP8 ', 'VP8L'].includes(name)).map(({name, bytes}) => chunk(name, bytes));
}
function frame(delay, {width = 512, height = 512, x = 0, y = 0, flags = 2, image = lossy} = {}) {
  const header = Buffer.alloc(16);
  header.writeUIntLE(x / 2, 0, 3);header.writeUIntLE(y / 2, 3, 3);
  header.writeUIntLE(width - 1, 6, 3);header.writeUIntLE(height - 1, 9, 3);
  header.writeUIntLE(delay, 12, 3);header[15] = flags;
  return chunk('ANMF', Buffer.concat([header, ...stillChunks(image)]));
}
function animated(delays = [100, 150], options = {}) {
  return riff('WEBP', [extension(), chunk('ANIM', Buffer.alloc(6)), ...delays.map(delay => frame(delay, options))]);
}
function wav({rate = 48000, channels = 2, duration = .25, frames = Math.round(duration * rate), extra = []} = {}) {
  const format = Buffer.alloc(16);
  format.writeUInt16LE(1);format.writeUInt16LE(channels, 2);format.writeUInt32LE(rate, 4);
  format.writeUInt32LE(rate * channels * 2, 8);format.writeUInt16LE(channels * 2, 12);format.writeUInt16LE(16, 14);
  return riff('WAVE', [chunk('fmt ', format), chunk('data', Buffer.alloc(frames * channels * 2)), ...extra]);
}
const invalid = error => error instanceof MediaValidationError && error.code === 'invalid_media' && error.statusCode === 422;
const tooLarge = error => error instanceof MediaValidationError && error.code === 'media_too_large' && error.statusCode === 413;

test('real lossy and lossless 512px WebP fixtures and a genuine animated mux are accepted', () => {
  for (const visual of [lossy, lossless]) assert.deepEqual(validateMedia({visual}), {kind: 'static', duration: 0});
  assert.deepEqual(validateMedia({visual: animated(), sound: editedMix}), {kind: 'animated', duration: .25, sampleRate: 48000, channels: 2});
  assert.deepEqual(validateMedia({visual: animated([83, 84, 83])}), {kind: 'animated', duration: .25});
});

test('RIFF length, chunk bounds, padding, signatures and supported chunks are checked', () => {
  const truncated = lossy.subarray(0, lossy.length - 1);
  const oversizedChunk = Buffer.from(lossy);oversizedChunk.writeUInt32LE(0xffffffff, 16);
  const wrongSignature = Buffer.from(lossy);wrongSignature.write('JPEG', 8);
  const unknown = riff('WEBP', [...stillChunks(), chunk('EVIL', Buffer.from('x'))]);
  const badPadding = Buffer.from(unknown);badPadding[badPadding.length - 1] = 1;
  for (const visual of [truncated, oversizedChunk, wrongSignature, unknown, badPadding, Buffer.concat([lossy, Buffer.from([0])]), Buffer.alloc(0), new Uint8Array(lossy)]) {
    assert.throws(() => validateMedia({visual}), invalid);
  }
  assert.throws(() => validateMedia({visual: Buffer.alloc(MEDIA_LIMITS.animatedBytes + 1)}), tooLarge);
});

test('static byte limit is enforced even when additional metadata is structurally valid', () => {
  const visual = riff('WEBP', [extension(8), ...stillChunks(), chunk('EXIF', Buffer.alloc(MEDIA_LIMITS.staticBytes))]);
  assert.throws(() => validateMedia({visual}), tooLarge);
});

test('real VP8 and VP8L dimensions and version bits cannot be hidden by a 512px VP8X header', () => {
  const lossyImage = entries(lossy).find(({name}) => name === 'VP8 ');
  const losslessImage = entries(lossless).find(({name}) => name === 'VP8L');
  const changedWidth = Buffer.from(lossyImage.bytes);changedWidth.writeUInt16LE(513, 6);
  const invalidScale = Buffer.from(lossyImage.bytes);invalidScale.writeUInt16LE(0x8200, 6);
  const interFrame = Buffer.from(lossyImage.bytes);interFrame[0] |= 1;
  const wrongMagic = Buffer.from(lossyImage.bytes);wrongMagic[3] = 0;
  const overflowPartition = Buffer.from(lossyImage.bytes);overflowPartition[0] = 0xf0;overflowPartition[1] = 0xff;overflowPartition[2] = 0xff;
  const losslessVersion = Buffer.from(losslessImage.bytes);losslessVersion[4] |= 0x80;
  const losslessWidth = Buffer.from(losslessImage.bytes);losslessWidth.writeUInt32LE((losslessWidth.readUInt32LE(1) & ~0x3fff) | 510, 1);
  for (const bytes of [changedWidth, invalidScale, interFrame, wrongMagic, overflowPartition]) {
    assert.throws(() => validateMedia({visual: riff('WEBP', [extension(0), chunk('VP8 ', bytes)])}), invalid);
  }
  for (const bytes of [losslessVersion, losslessWidth]) {
    assert.throws(() => validateMedia({visual: riff('WEBP', [extension(0x10), chunk('VP8L', bytes)])}), invalid);
  }
  const reserved = Buffer.alloc(10);reserved[0] = 0x80;reserved.writeUIntLE(511, 4, 3);reserved.writeUIntLE(511, 7, 3);
  assert.throws(() => validateMedia({visual: riff('WEBP', [chunk('VP8X', reserved), ...stillChunks()])}), invalid);
  assert.throws(() => validateMedia({visual: riff('WEBP', [extension(0), extension(0), ...stillChunks()])}), invalid);
});

test('animation raw timing, total duration, frame bounds and ordering remain bounded', () => {
  for (const delays of [[0, 100], [7, 100], [3001, 3000], [100]]) assert.throws(() => validateMedia({visual: animated(delays)}), invalid);
  assert.deepEqual(validateMedia({visual: animated(Array(750).fill(8))}), {kind: 'animated', duration: 6});
  assert.throws(() => validateMedia({visual: animated(Array(751).fill(8))}), invalid);
  for (const options of [{x: 2}, {width: 513}, {height: 511}, {flags: 0x80}]) {
    assert.throws(() => validateMedia({visual: animated([100, 150], options)}), invalid);
  }
  assert.throws(() => validateMedia({visual: riff('WEBP', [extension(), frame(100), chunk('ANIM', Buffer.alloc(6)), frame(150)])}), invalid);
  assert.throws(() => validateMedia({visual: riff('WEBP', [extension(), chunk('ANIM', Buffer.alloc(6)), frame(100), ...stillChunks(), frame(150)])}), invalid);
});

test('missing alpha, duplicate image data and invalid raw-alpha payloads are rejected', () => {
  const losslessImage = entries(lossless).find(({name}) => name === 'VP8L');
  assert.throws(() => validateMedia({visual: riff('WEBP', [extension(0), chunk('VP8L', losslessImage.bytes)])}), invalid);
  assert.throws(() => validateMedia({visual: riff('WEBP', [...stillChunks(), ...stillChunks()])}), invalid);
  assert.throws(() => validateMedia({visual: riff('WEBP', [extension(0x10), chunk('ALPH', Buffer.from([0, 0])), ...stillChunks()])}), invalid);
});

test('PCM16 mono/stereo sample counts at each accepted rate match the final animation', () => {
  const visual = animated();
  for (const rate of [8000, 44100, 48000, 96000]) for (const channels of [1, 2]) {
    assert.deepEqual(validateMedia({visual, sound: wav({rate, channels})}), {kind: 'animated', duration: .25, sampleRate: rate, channels});
    assert.doesNotThrow(() => validateMedia({visual, sound: wav({rate, channels, frames: Math.round(rate / 4) + 1})}));
    assert.throws(() => validateMedia({visual, sound: wav({rate, channels, frames: Math.round(rate / 4) + 2})}), invalid);
  }
  assert.throws(() => validateMedia({visual, sound: wav({duration: .5})}), invalid);
  assert.throws(() => validateMedia({visual: lossy, sound: editedMix}), invalid);
  assert.throws(() => validateMedia({visual, sound: null}), invalid);
});

test('malformed WAV formats, byte rates, chunks, durations and lengths are rejected', () => {
  const visual = animated();
  const corrupt = [];
  for (const [at, value] of [[20, 3], [22, 3], [24, 7999], [24, 96001], [28, 1], [32, 1], [34, 24]]) {
    const bytes = wav();
    if ([24, 28].includes(at)) bytes.writeUInt32LE(value, at);else bytes.writeUInt16LE(value, at);
    corrupt.push(bytes);
  }
  const parts = entries(wav());
  corrupt.push(riff('WAVE', [chunk('data', parts[1].bytes), chunk('fmt ', parts[0].bytes)]));
  corrupt.push(riff('WAVE', [chunk('fmt ', parts[0].bytes), chunk('fmt ', parts[0].bytes), chunk('data', parts[1].bytes)]));
  corrupt.push(riff('WAVE', [chunk('fmt ', parts[0].bytes), chunk('data', parts[1].bytes), chunk('data', parts[1].bytes)]));
  corrupt.push(riff('WAVE', [chunk('fmt ', parts[0].bytes), chunk('data', Buffer.alloc(3))]));
  corrupt.push(wav({frames: 0}), wav({duration: 6.101}), Buffer.concat([wav(), Buffer.from([0])]), wav().subarray(0, 42));
  for (const sound of corrupt) assert.throws(() => validateMedia({visual, sound}), invalid);
  assert.throws(() => validateMedia({visual, sound: Buffer.alloc(MEDIA_LIMITS.soundBytes + 1)}), tooLarge);
});

test('validation never mutates the saved visual or pre-mixed audio', () => {
  const visual = animated(), sound = Buffer.from(editedMix), originalVisual = Buffer.from(visual), originalSound = Buffer.from(sound);
  validateMedia({visual, sound});
  assert.deepEqual(visual, originalVisual);assert.deepEqual(sound, originalSound);
});

async function temporary(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'zapstick-media-test-'));
  try { return await run(directory); }
  finally { await rm(directory, {recursive: true, force: true}); }
}
async function missing(file) { await assert.rejects(access(file), {code: 'ENOENT'}); }
function decode(file) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-ar', '48000', '-ac', '2', 'pipe:1'], {maxBuffer: 1024 * 1024});
  assert.equal(result.status, 0, String(result.stderr));
  return result.stdout;
}
function rms(pcm, start, end, channel = 0) {
  let sum = 0, count = 0;
  for (let frame = Math.round(start * 48000); frame < Math.round(end * 48000); frame++) {
    const value = pcm.readFloatLE((frame * 2 + channel) * 4);sum += value * value;count++;
  }
  return Math.sqrt(sum / count);
}

test('real FFmpeg keeps the two already-edited excerpts, initial silence, stereo balance and final duration', {skip: !ffmpegAvailable && 'FFmpeg is not installed.'}, async () => {
  await temporary(async directory => {
    const outputPath = path.join(directory, 'sound.ogg');
    const result = await encodeOpus({inputPath: path.join(fixtures, 'two-excerpts.wav'), outputPath});
    assert.deepEqual({...result, bytes: 0}, {mime: 'audio/ogg; codecs=opus', duration: .25, sampleRate: 48000, channels: 2, bytes: 0});
    assert.ok(result.bytes > 100 && result.bytes <= MEDIA_LIMITS.opusBytes);
    const pcm = decode(outputPath);
    assert.equal(pcm.length / 8, 12000, 'pre-skip and end trimming preserve the exact audible sample count');
    const first = rms(pcm, .04, .08), second = rms(pcm, .17, .21);
    assert.ok(first > .2 && first < .36);assert.ok(second > .09 && second < .2);
    assert.ok(rms(pcm, .002, .012) < .005);assert.ok(rms(pcm, .12, .13) < .01);
    assert.ok(Math.abs(rms(pcm, .04, .08, 1) / first - .5) < .04);
    if (ffprobeAvailable) {
      const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json', outputPath], {encoding: 'utf8'});
      assert.equal(probe.status, 0, probe.stderr);
      assert.deepEqual(JSON.parse(probe.stdout).streams, [{codec_name: 'opus', sample_rate: '48000', channels: 2}]);
    }
  });
});

test('a muted mix stays muted and mono 44.1kHz is normalized without moving its end', {skip: !ffmpegAvailable && 'FFmpeg is not installed.'}, async () => {
  await temporary(async directory => {
    const inputPath = path.join(directory, 'muted.wav'), outputPath = path.join(directory, 'muted.ogg');
    await writeFile(inputPath, wav({rate: 44100, channels: 1}));
    const result = await encodeOpus({inputPath, outputPath});
    assert.equal(result.channels, 1);assert.equal(result.duration, .25);
    const pcm = decode(outputPath);assert.equal(pcm.length / 8, 12000);
    assert.ok(rms(pcm, 0, .25) < .00001);
  });
});

test('encoding only accepts distinct absolute local paths, validates input and never overwrites files', async () => {
  for (const inputPath of ['sound.wav', 'https://example.com/sound.wav', 'file:///tmp/sound.wav']) {
    await assert.rejects(encodeOpus({inputPath, outputPath: '/tmp/output.ogg'}), invalid);
  }
  await assert.rejects(encodeOpus({inputPath: '/tmp/same', outputPath: '/tmp/same'}), invalid);
  await temporary(async directory => {
    const inputPath = path.join(directory, 'bad.wav'), outputPath = path.join(directory, 'exists.ogg');
    await writeFile(inputPath, 'not a WAV');await writeFile(outputPath, 'keep this');
    await assert.rejects(encodeOpus({inputPath, outputPath}), invalid);
    await writeFile(inputPath, editedMix);
    await assert.rejects(encodeOpus({inputPath, outputPath}));
    assert.equal(await readFile(outputPath, 'utf8'), 'keep this');
    const linkedInput = path.join(directory, 'linked.wav');await symlink(inputPath, linkedInput);
    await assert.rejects(encodeOpus({inputPath: linkedInput, outputPath: path.join(directory, 'unused.ogg')}));
    await missing(path.join(directory, 'unused.ogg'));
    await assert.rejects(encodeOpus({inputPath, outputPath: path.join(directory, 'aborted.ogg'), signal: AbortSignal.abort()}), {name: 'AbortError', code: 'encoding_cancelled'});
    await missing(path.join(directory, 'aborted.ogg'));
  });
});

async function fakeEncoder(directory, program, run) {
  const executable = path.join(directory, 'ffmpeg');
  await writeFile(executable, `#!${process.execPath}\n${program}\n`);await chmod(executable, 0o700);
  const original = process.env.PATH;process.env.PATH = directory;
  try { return await run(); }
  finally { if (original === undefined) delete process.env.PATH;else process.env.PATH = original; }
}
async function waitForFile(file) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { return await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Test encoder did not start.');
}

test('abort kills the running process, rejects a simultaneous conversion and removes partial output', async () => {
  await temporary(async directory => {
    const marker = path.join(directory, 'started'), outputPath = path.join(directory, 'aborted.ogg');
    const code = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); process.stdin.resume(); setInterval(() => {}, 1000);`;
    await fakeEncoder(directory, code, async () => {
      const controller = new AbortController();
      const first = encodeOpus({inputPath: path.join(fixtures, 'two-excerpts.wav'), outputPath, signal: controller.signal});
      const observed = first.catch(error => error);
      const pid = Number(await waitForFile(marker));
      await assert.rejects(encodeOpus({inputPath: path.join(fixtures, 'two-excerpts.wav'), outputPath: path.join(directory, 'second.ogg')}), {code: 'encoding_busy'});
      controller.abort();
      assert.equal((await observed).name, 'AbortError');
      assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'});
      await missing(outputPath);await missing(path.join(directory, 'second.ogg'));
    });
  });
});

test('missing encoder, nonzero exit, oversized diagnostics and invalid output fail without exposing diagnostics', async () => {
  await temporary(async directory => {
    for (const [program, expected] of [
      ['process.stdin.resume();process.exitCode=2;', 'encoding_failed'],
      [`process.stdin.resume();process.stderr.write('sensitive diagnostic'.repeat(1000));setInterval(()=>{},1000);`, 'encoding_failed'],
      [`process.stdin.resume();process.stdout.write('not Ogg');`, 'encoding_failed'],
      [`process.stdin.resume();process.stdout.write(Buffer.alloc(${MEDIA_LIMITS.opusBytes + 1}));`, 'encoding_failed'],
    ]) {
      const outputPath = path.join(directory, 'failed.ogg');
      await fakeEncoder(directory, program, async () => {
        await assert.rejects(encodeOpus({inputPath: path.join(fixtures, 'two-excerpts.wav'), outputPath}), error => error.code === expected && !error.message.includes('sensitive'));
      });
      await missing(outputPath);
    }
    const original = process.env.PATH;process.env.PATH = path.join(directory, 'missing-bin');
    try {
      await assert.rejects(encodeOpus({inputPath: path.join(fixtures, 'two-excerpts.wav'), outputPath: path.join(directory, 'missing.ogg')}), {code: 'encoder_unavailable'});
      await missing(path.join(directory, 'missing.ogg'));
    } finally { if (original === undefined) delete process.env.PATH;else process.env.PATH = original; }
  });
});

test('the actual 15-second deadline kills a hung encoder and removes its output', {timeout: 20_000}, async () => {
  await temporary(async directory => {
    const marker = path.join(directory, 'hung'), outputPath = path.join(directory, 'timeout.ogg');
    const code = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid));process.stdin.resume();setInterval(()=>{},1000);`;
    await fakeEncoder(directory, code, async () => {
      const started = Date.now();
      await assert.rejects(encodeOpus({inputPath: path.join(fixtures, 'two-excerpts.wav'), outputPath}), {code: 'encoding_timeout'});
      assert.ok(Date.now() - started >= MEDIA_LIMITS.encodeTimeoutMs - 50);
      const pid = Number(await readFile(marker, 'utf8'));
      assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'});
      await missing(outputPath);
    });
  });
});
