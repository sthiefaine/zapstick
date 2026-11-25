import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);
function loadTS(file, overrides = {}, cache = new Map()) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = {exports: {}};cache.set(absolute, module);
  const source = fs.readFileSync(absolute, 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  const require = name => overrides[name] ?? (name.startsWith('.')
    ? loadTS(path.resolve(path.dirname(absolute), `${name}.ts`), overrides, cache) : nodeRequire(name));
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}

class TestAudioBuffer {
  constructor({length, sampleRate, numberOfChannels}) {
    Object.assign(this, {length, sampleRate, numberOfChannels, duration: length / sampleRate});
    this.channels = Array.from({length: numberOfChannels}, () => new Float32Array(length));
  }
  getChannelData(channel) { return this.channels[channel]; }
  copyToChannel(data, channel) { this.channels[channel].set(data); }
}

// Raster adapter runs the production streaming WebP compositor in Node. Only
// still-image decoding uses sharp; codec probes and encoders are simulated.
class RasterCanvas {
  _width = 0;_height = 0;data = new Uint8ClampedArray();
  constructor(width, height) { this.width = width;this.height = height; }
  get width() {return this._width;}set width(value) {this._width = value;this.data = new Uint8ClampedArray(this._width * this._height * 4);}
  get height() {return this._height;}set height(value) {this._height = value;this.data = new Uint8ClampedArray(this._width * this._height * 4);}
  getContext() {
    const canvas = this;
    return {
      clearRect(x, y, width, height) {for (let j = y; j < y + height; j++) canvas.data.fill(0, (j * canvas.width + x) * 4, (j * canvas.width + x + width) * 4);},
      fillStyle: '#000000',
      fillRect(x, y, width, height) {
        const color = this.fillStyle[0] === '#'
          ? [1, 3, 5].map(at => parseInt(this.fillStyle.slice(at, at + 2), 16)).concat(255)
          : this.fillStyle.match(/[\d.]+/g).map((n, i) => i === 3 ? Math.round(Number(n) * 255) : Number(n));
        for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) canvas.data.set(color, (j * canvas.width + i) * 4);
      },
      drawImage(source, x, y, width = source.width, height = source.height) {
        for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
          const from = (Math.floor(j * source.height / height) * source.width + Math.floor(i * source.width / width)) * 4;
          const to = ((j + y) * canvas.width + i + x) * 4;
          const alpha = source.data[from + 3] / 255, oldAlpha = canvas.data[to + 3] / 255, combined = alpha + oldAlpha * (1 - alpha);
          for (let c = 0; c < 3; c++) canvas.data[to + c] = combined ? Math.round((source.data[from + c] * alpha + canvas.data[to + c] * oldAlpha * (1 - alpha)) / combined) : 0;
          canvas.data[to + 3] = Math.round(combined * 255);
        }
      },
    };
  }
}

async function fixture(durations = [83, 84, 83]) {
  const sharp = nodeRequire('sharp'), {muxWebp} = loadTS('lib/stickers/webp-mux.ts'), frames = [];
  for (const [index, color] of [[0, [255, 0, 0, 255]], [1, [0, 0, 255, 255]], [2, [0, 255, 0, 255]]]) {
    const rgba = Buffer.alloc(512 * 512 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) rgba.set(color, (y * 512 + x) * 4);
    frames.push({bytes: new Uint8Array(await sharp(rgba, {raw: {width: 512, height: 512, channels: 4}}).webp({lossless: true}).toBuffer()), duration: durations[index]});
  }
  return muxWebp(frames);
}

async function environment(run, {mp4 = true} = {}) {
  const names = ['window', 'OffscreenCanvas', 'createImageBitmap', 'AudioBuffer'];
  const saved = Object.fromEntries(names.map(name => [name, globalThis[name]]));
  const metrics = {frames: [], audio: null, probes: [], outputs: [], bitmaps: 0, maxBitmaps: 0, imports: 0, audioStops: new Set()};
  const sharp = nodeRequire('sharp');
  globalThis.window = {};globalThis.OffscreenCanvas = RasterCanvas;globalThis.AudioBuffer = TestAudioBuffer;
  globalThis.createImageBitmap = async blob => {
    const {data, info} = await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject: true});
    metrics.bitmaps++;metrics.maxBitmaps = Math.max(metrics.maxBitmaps, metrics.bitmaps);
    return {data, width: info.width, height: info.height, close() {metrics.bitmaps--;}};
  };
  const bunny = {
    Quality: class {}, BufferTarget: class {}, Mp4OutputFormat: class {}, WebMOutputFormat: class {},
    async canEncodeVideo(codec) {metrics.probes.push(codec);return mp4 || codec === 'vp8';},
    async canEncodeAudio(codec) {metrics.probes.push(codec);return mp4 || codec === 'opus';},
    CanvasSource: class {
      constructor(canvas, config) {this.canvas = canvas;metrics.videoCodec = config.codec;}
      async add(timestamp, duration) {
        const pixel = (x, y) => Array.from(this.canvas.data.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 4));
        metrics.frames.push({timestamp, duration, foreground: pixel(10, 10), background: pixel(400, 400)});
        await metrics.frameHook?.();
      }
      close() {metrics.videoClosed = true;}
    },
    AudioBufferSource: class {
      constructor(config) {metrics.audioCodec = config.codec;}
      async add(audio) {metrics.audio = audio;}
      close() {metrics.audioClosed = true;}
    },
    Output: class {
      constructor({target}) {this.target = target;this.state = 'pending';metrics.outputs.push(this);}
      addVideoTrack() {} addAudioTrack() {}
      async start() {this.state = 'started';}
      async cancel() {this.state = 'canceled';metrics.cancelled = true;}
      async finalize() {this.state = 'finalized';this.target.buffer = new Uint8Array([1, 2, 3]).buffer;}
    },
  };
  const exports = loadTS('lib/stickers/sound-export.ts', {
    'mediabunny': new Proxy(bunny, {get(target, key) {metrics.imports++;return target[key];}}),
    './audio': {registerAudioWork(stop) {metrics.audioStops.add(stop);return () => metrics.audioStops.delete(stop);}},
  });
  try {await run(exports, metrics);} finally {for (const name of names) if (saved[name] === undefined) delete globalThis[name];else globalThis[name] = saved[name];}
}

test('sound export keeps actual WebP frame colors/timestamps, paints an opaque background, and aligns short audio', async () => {
  const visual = await fixture();
  await environment(async ({exportSoundVideo}, metrics) => {
    assert.equal(metrics.imports, 0);
    const audio = new TestAudioBuffer({length: 4800, sampleRate: 48000, numberOfChannels: 1});audio.getChannelData(0).fill(.25);
    const progress = [], result = await exportSoundVideo(visual, audio, {onProgress: value => progress.push(value)});
    assert.equal(result.extension, 'mp4');assert.equal(result.blob.type, 'video/mp4');
    assert.deepEqual([metrics.videoCodec, metrics.audioCodec], ['avc', 'aac']);
    assert.deepEqual(metrics.frames.map(frame => frame.foreground), [[255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255]]);
    assert.ok(metrics.frames.every(frame => frame.background.every(value => value === 255)));
    assert.deepEqual(metrics.frames.map(frame => frame.timestamp), [0, .083, .167]);
    assert.ok(Math.abs(metrics.frames.reduce((sum, frame) => sum + frame.duration, 0) - .25) < 1e-10);
    assert.equal(metrics.audio.duration, .25);assert.equal(metrics.audio.getChannelData(0)[100], .25);assert.equal(metrics.audio.getChannelData(0)[5000], 0);
    assert.equal(metrics.maxBitmaps, 1);assert.equal(metrics.bitmaps, 0);assert.ok(metrics.audioClosed && metrics.videoClosed);
    assert.equal(metrics.audioStops.size, 0);
    assert.equal(progress.at(-1), 100);assert.ok(progress.every((value, i) => i === 0 || value >= progress[i - 1]));
  });
});

test('clearing local audio work cancels an export and unregisters its cleanup', async () => {
  const visual = await fixture();
  await environment(async ({exportSoundVideo}, metrics) => {
    metrics.frameHook = () => {for (const stop of [...metrics.audioStops]) stop();};
    await assert.rejects(exportSoundVideo(visual, new TestAudioBuffer({length: 12000, sampleRate: 48000, numberOfChannels: 1})), {name: 'AbortError'});
    assert.ok(metrics.cancelled);assert.equal(metrics.audioStops.size, 0);assert.equal(metrics.bitmaps, 0);
  });
});

test('missing MP4 codecs select a genuine WebM codec pair and expose the WebM extension', async () => {
  const visual = await fixture();
  await environment(async ({exportSoundVideo}, metrics) => {
    const result = await exportSoundVideo(visual, new TestAudioBuffer({length: 12000, sampleRate: 48000, numberOfChannels: 1}));
    assert.equal(result.extension, 'webm');assert.equal(result.blob.type, 'video/webm');
    assert.deepEqual(metrics.probes, ['avc', 'aac', 'vp8', 'opus']);
    assert.deepEqual([metrics.videoCodec, metrics.audioCodec], ['vp8', 'opus']);
  }, {mp4: false});
});

test('a long animation is cut at six seconds with a partial final frame and matching audio length', async () => {
  const visual = await fixture([2000, 2000, 3000]);
  await environment(async ({exportSoundVideo}, metrics) => {
    await exportSoundVideo(visual, new TestAudioBuffer({length: 6 * 48000, sampleRate: 48000, numberOfChannels: 1}));
    assert.deepEqual(metrics.frames.map(({timestamp, duration}) => ({timestamp, duration})), [
      {timestamp: 0, duration: 2}, {timestamp: 2, duration: 2}, {timestamp: 4, duration: 2},
    ]);
    assert.equal(metrics.audio.duration, 6);
  });
});

test('cancellation releases the muxer/decoder, then permits another export; invalid audio fails before loading codecs', async () => {
  const visual = await fixture();
  await environment(async ({exportSoundVideo}, metrics) => {
    const audio = new TestAudioBuffer({length: 12000, sampleRate: 48000, numberOfChannels: 1});
    const before = new AbortController();before.abort();await assert.rejects(exportSoundVideo(visual, audio, {signal: before.signal}), {name: 'AbortError'});
    await assert.rejects(exportSoundVideo(visual, {...audio, duration: 7}), /6 secondes/);assert.equal(metrics.imports, 0);
    const controller = new AbortController();metrics.frameHook = () => controller.abort();
    await assert.rejects(exportSoundVideo(visual, audio, {signal: controller.signal}), {name: 'AbortError'});
    assert.ok(metrics.cancelled);assert.equal(metrics.bitmaps, 0);
    metrics.frameHook = undefined;
    assert.equal((await exportSoundVideo(visual, audio)).extension, 'mp4');
    await assert.rejects(exportSoundVideo(new Blob(['invalid']), audio), /illisible/);
  });
});

test('bounded export timeout cancels an unresponsive encoding step', async () => {
  const visual = await fixture();
  await environment(async ({exportSoundVideo}, metrics) => {
    const timer = globalThis.setTimeout, clear = globalThis.clearTimeout;
    globalThis.setTimeout = (callback, milliseconds, ...args) => timer(callback, milliseconds === 90_000 ? 10 : milliseconds, ...args);
    globalThis.clearTimeout = clear;
    metrics.frameHook = () => new Promise(() => {});
    try {
      await assert.rejects(exportSoundVideo(visual, new TestAudioBuffer({length: 12000, sampleRate: 48000, numberOfChannels: 1})), /trop de temps/);
      assert.ok(metrics.cancelled);
    } finally {globalThis.setTimeout = timer;globalThis.clearTimeout = clear;}
  });
});
