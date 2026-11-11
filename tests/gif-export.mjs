import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';
import {parseGIF, decompressFrames} from 'gifuct-js';

const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), cache = new Map();
function loadTS(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const module = {exports: {}};cache.set(absolute, module);
  const text = fs.readFileSync(absolute, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(absolute).href));
  const code = ts.transpileModule(text, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const localRequire = specifier => specifier.startsWith('.') ? loadTS(path.resolve(path.dirname(absolute), specifier + (path.extname(specifier) ? '' : '.ts'))) : require(specifier);
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);return module.exports;
}
const {createGifFrameEncoder} = loadTS('lib/stickers/gif-encoder.ts');
const {gifCentisecondDelays, gifRepeatFromWebp, inspectGifAnimation, GIF_EXPORT_LIMITS} = loadTS('lib/stickers/gif-export-core.ts');
const {parseWebpAnimation, webpFrameBlob, decodeWebpFrames} = loadTS('lib/stickers/webp-animation.ts');
const {exportAnimatedGif} = loadTS('lib/stickers/gif-export.ts');
const solid = (width, height, color) => new Uint8ClampedArray(Array.from({length: width * height}, () => color).flat());
const pixel = (rgba, width, x, y) => Array.from(rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 4));

test('encoder emits a real animated GIF, with transparent pixels, opaque black and exact cumulative duration', async () => {
  const encoder = createGifFrameEncoder(2, 2, 0), delays = gifCentisecondDelays(Array(72).fill(1000 / 12));
  for (let i = 0; i < delays.length; i++) {
    const rgba = solid(2, 2, [0, 0, 0, 0]);
    rgba.set(i % 2 ? [0, 0, 255, 255] : [255, 0, 0, 255], 0);rgba.set([0, 0, 0, 255], 12);
    encoder.add(rgba, delays[i]);
  }
  const blob = encoder.finish(), bytes = new Uint8Array(await blob.arrayBuffer()), gif = parseGIF(bytes), frames = decompressFrames(gif, true);
  assert.equal(blob.type, 'image/gif');assert.equal(Buffer.from(bytes.subarray(0, 6)).toString(), 'GIF89a');assert.equal(bytes.at(-1), 0x3b);
  assert.equal(frames.length, 72);assert.equal(frames.reduce((sum, frame) => sum + frame.delay, 0), 6000);
  assert.equal(pixel(frames[0].patch, 2, 1, 0)[3], 0);assert.deepEqual(pixel(frames[0].patch, 2, 1, 1), [0, 0, 0, 255]);
  assert.ok(pixel(frames[0].patch, 2, 0, 0)[0] > 200);assert.ok(pixel(frames[1].patch, 2, 0, 0)[2] > 200);
  assert.ok(frames.every(frame => frame.disposalType === 2 && frame.transparentIndex === 0));
  assert.deepEqual(inspectGifAnimation(bytes), {width: 2, height: 2, frames: 72, durationMs: 6000});
});

test('finite and infinite WebP loops map to GIF repetitions; frame delay rounding never drifts', async () => {
  assert.equal(gifRepeatFromWebp(0), 0);assert.equal(gifRepeatFromWebp(1), -1);assert.equal(gifRepeatFromWebp(2), 1);
  const delays = gifCentisecondDelays([83, 84, 83]);assert.deepEqual(delays, [8, 9, 8]);
  const encoder = createGifFrameEncoder(1, 1, gifRepeatFromWebp(2));
  for (const delay of delays) encoder.add(solid(1, 1, [255, 0, 0, 255]), delay);
  const bytes = Buffer.from(await encoder.finish().arrayBuffer()), extension = bytes.indexOf('NETSCAPE2.0');
  assert.ok(extension > 0);assert.equal(bytes[extension + 13] | bytes[extension + 14] << 8, 1);
  assert.throws(() => gifCentisecondDelays(Array(20).fill(1)), /trop rapide/);
  assert.throws(() => gifCentisecondDelays([GIF_EXPORT_LIMITS.durationMs + 1]), /volumineuse/);
});

function chunk(name, data) {const header = Buffer.alloc(8);header.write(name);header.writeUInt32LE(data.length, 4);return Buffer.concat([header, data, ...(data.length % 2 ? [Buffer.alloc(1)] : [])]);}
function uint24(buffer, at, value) {buffer[at] = value & 255;buffer[at + 1] = value >>> 8 & 255;buffer[at + 2] = value >>> 16 & 255;}
function animatedWebp(frames, width = 4, height = 4, loop = 2) {
  const vp8x = Buffer.alloc(10);vp8x[0] = 0x12;uint24(vp8x, 4, width - 1);uint24(vp8x, 7, height - 1);
  const anim = Buffer.alloc(6);anim.writeUInt16LE(loop, 4);
  const parts = [chunk('VP8X', vp8x), chunk('ANIM', anim)];
  for (const frame of frames) {
    const meta = Buffer.alloc(16);uint24(meta, 0, (frame.x ?? 0) / 2);uint24(meta, 3, (frame.y ?? 0) / 2);uint24(meta, 6, frame.width - 1);uint24(meta, 9, frame.height - 1);uint24(meta, 12, frame.delay ?? 83);meta[15] = (frame.dispose ? 1 : 0) | (frame.blend ? 0 : 2);
    const data = [];
    for (let at = 12; at + 8 <= frame.webp.length;) {
      const size = frame.webp.readUInt32LE(at + 4), end = at + 8 + size + size % 2;
      if (['ALPH', 'VP8 ', 'VP8L'].includes(frame.webp.subarray(at, at + 4).toString())) data.push(frame.webp.subarray(at, end));at = end;
    }
    parts.push(chunk('ANMF', Buffer.concat([meta, ...data])));
  }
  const body = Buffer.concat([Buffer.from('WEBP'), ...parts]), riff = Buffer.alloc(8);riff.write('RIFF');riff.writeUInt32LE(body.length, 4);return new Uint8Array(Buffer.concat([riff, body]));
}

// A tiny raster adapter exercises the production streaming compositor in Node.
// Only still WebP decoding is delegated to the same libwebp used by sharp/Next.
class RasterCanvas {
  _width = 0;_height = 0;data = new Uint8ClampedArray(0);
  constructor(width, height) {this.width = width;this.height = height;}
  get width() {return this._width;}set width(value) {this._width = value;this.data = new Uint8ClampedArray(this._width * this._height * 4);}
  get height() {return this._height;}set height(value) {this._height = value;this.data = new Uint8ClampedArray(this._width * this._height * 4);}
  getContext() {
    const canvas = this;
    return {
      clearRect(x, y, width, height) {for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) canvas.data.fill(0, (j * canvas.width + i) * 4, (j * canvas.width + i) * 4 + 4);},
      fillRect(x, y, width, height) {const color = this.fillStyle.match(/[\d.]+/g).map(Number);for (let j = y; j < y + height; j++) for (let i = x; i < x + width; i++) canvas.data.set([color[0], color[1], color[2], Math.round(color[3] * 255)], (j * canvas.width + i) * 4);},
      drawImage(source, x, y, width = source.width, height = source.height) {
        for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
          const from = (Math.floor(j * source.height / height) * source.width + Math.floor(i * source.width / width)) * 4, to = ((j + y) * canvas.width + i + x) * 4;
          const alpha = source.data[from + 3] / 255, oldAlpha = canvas.data[to + 3] / 255, blended = alpha + oldAlpha * (1 - alpha);
          for (let c = 0; c < 3; c++) canvas.data[to + c] = blended ? Math.round((source.data[from + c] * alpha + canvas.data[to + c] * oldAlpha * (1 - alpha)) / blended) : 0;
          canvas.data[to + 3] = Math.round(blended * 255);
        }
      },
      getImageData() {return {data: canvas.data.slice()};},
    };
  }
}

test('RIFF fallback decodes real lossy/lossless frame payloads and streams blend/disposal with one live bitmap', async () => {
  const sharp = require('sharp'), encoded = async (color, lossless = true) => sharp(solid(2, 2, color), {raw: {width: 2, height: 2, channels: 4}}).webp({lossless, quality: 100}).toBuffer();
  const bytes = animatedWebp([
    {width: 2, height: 2, webp: await encoded([255, 0, 0, 255]), delay: 83},
    {width: 2, height: 2, x: 2, webp: await encoded([0, 0, 255, 128], false), delay: 84, blend: true, dispose: true},
    {width: 2, height: 2, y: 2, webp: await encoded([0, 255, 0, 255]), delay: 83},
  ]), animation = parseWebpAnimation(bytes);
  assert.equal(animation.width, 4);assert.equal(animation.frames.length, 3);assert.equal(animation.loopCount, 2);
  const globals = {OffscreenCanvas: globalThis.OffscreenCanvas, createImageBitmap: globalThis.createImageBitmap};let live = 0, maxLive = 0;
  globalThis.OffscreenCanvas = RasterCanvas;
  globalThis.createImageBitmap = async blob => {
    const {data, info} = await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject: true});live++;maxLive = Math.max(maxLive, live);
    return {width: info.width, height: info.height, data, close() {live--;}};
  };
  try {
    const standalone = await sharp(Buffer.from(await webpFrameBlob(bytes, animation, animation.frames[1]).arrayBuffer())).metadata();assert.equal(standalone.width, 2);assert.equal(standalone.height, 2);assert.equal(standalone.hasAlpha, true);
    const frames = [], encoder = createGifFrameEncoder(4, 4, gifRepeatFromWebp(animation.loopCount)), delays = gifCentisecondDelays(animation.frames.map(frame => frame.durationMs));let surface;
    for await (const frame of decodeWebpFrames(bytes, animation, {strategy: 'bitmap'})) {
      if (surface) assert.equal(frame.canvas, surface);surface = frame.canvas;
      frames.push(frame.canvas.data.slice());encoder.add(frame.canvas.data.slice(), delays[frame.index]);assert.equal(live, 0);
    }
    assert.equal(maxLive, 1);assert.equal(live, 0);assert.equal(frames.length, 3);assert.equal(surface.width, 0);
    assert.ok(pixel(frames[1], 4, 0, 0)[0] > 200);assert.ok(pixel(frames[1], 4, 2, 0)[2] > 200);
    assert.equal(pixel(frames[2], 4, 2, 0)[3], 0);assert.ok(pixel(frames[2], 4, 0, 2)[1] > 200);
    const gifFrames = decompressFrames(parseGIF(new Uint8Array(await encoder.finish().arrayBuffer())), true);
    assert.equal(gifFrames.length, 3);assert.equal(gifFrames.reduce((sum, frame) => sum + frame.delay, 0), 250);assert.equal(pixel(gifFrames[2].patch, 4, 2, 0)[3], 0);
    const oversized = bytes.slice();uint24(oversized, 24, 9999);assert.throws(() => parseWebpAnimation(oversized), /volumineuse/);
    const spoofed = bytes.slice();uint24(spoofed, animation.frames[0].start - 16 + 6, 2);assert.throws(() => parseWebpAnimation(spoofed), /illisible/);
    assert.throws(() => parseWebpAnimation(bytes.subarray(0, bytes.length - 1)), /illisible/);
  } finally {Object.assign(globalThis, globals);}
});

test('worker API is lazy, returns GIF MIME, reports monotonic progress and terminates on cancellation', async () => {
  const globals = {window: globalThis.window, Worker: globalThis.Worker, OffscreenCanvas: globalThis.OffscreenCanvas};let starts = 0, terminations = 0, lastWorker;
  const encoder = createGifFrameEncoder(1, 1);encoder.add(solid(1, 1, [255, 0, 0, 255]), 10);encoder.add(solid(1, 1, [0, 0, 255, 255]), 10);const gif = encoder.finish();
  class FakeWorker {
    constructor() {starts++;lastWorker = this;}
    postMessage() {queueMicrotask(() => {this.onmessage?.({data: {type: 'progress', percent: 50}});this.onmessage?.({data: {type: 'progress', percent: 20}});if (!this.pending) this.onmessage?.({data: {type: 'result', blob: gif}});});}
    terminate() {terminations++;}
  }
  globalThis.window = {};globalThis.Worker = FakeWorker;globalThis.OffscreenCanvas = RasterCanvas;
  try {
    assert.equal(starts, 0);
    const before = new AbortController();before.abort();await assert.rejects(exportAnimatedGif(gif, {signal: before.signal}), {name: 'AbortError'});assert.equal(starts, 0);
    const progress = [], output = await exportAnimatedGif(gif, {onProgress: value => progress.push(value)});
    assert.equal(output.type, 'image/gif');assert.deepEqual(progress, [0, 50, 50, 100]);assert.equal(terminations, 1);
    const controller = new AbortController(), pending = exportAnimatedGif(gif, {signal: controller.signal});lastWorker.pending = true;
    await assert.rejects(exportAnimatedGif(gif), /déjà en préparation/);controller.abort();await assert.rejects(pending, {name: 'AbortError'});assert.equal(terminations, 2);
  } finally {Object.assign(globalThis, globals);}
});

test('worker keeps an existing GIF byte-for-byte and refuses an invalid WebP instead of renaming it', async () => {
  const encoder = createGifFrameEncoder(2, 2, 1);encoder.add(solid(2, 2, [255, 0, 0, 255]), 8);encoder.add(solid(2, 2, [0, 0, 255, 255]), 9);
  const input = encoder.finish(), messages = [], globals = {onmessage: globalThis.onmessage, postMessage: globalThis.postMessage};
  globalThis.postMessage = value => messages.push(value);
  try {
    loadTS('lib/stickers/gif-export.worker.ts');
    await globalThis.onmessage({data: {blob: input}});
    assert.equal(messages[0].type, 'result');assert.equal(messages[0].blob.type, 'image/gif');
    assert.deepEqual(new Uint8Array(await messages[0].blob.arrayBuffer()), new Uint8Array(await input.arrayBuffer()));
    messages.length = 0;
    await globalThis.onmessage({data: {blob: new Blob(['not a WebP'], {type: 'image/webp'})}});
    assert.deepEqual(messages, [{type: 'error', code: 'format'}]);
  } finally {Object.assign(globalThis, globals);}
});

test('GIF export strings cover every locale and preserve progress placeholders', () => {
  const {gifSources, gifTranslations} = loadTS('lib/i18n/gif-translations.ts');
  for (const locale of ['fr', 'en', 'pt-BR', 'es', 'de', 'zh-CN', 'ja', 'ru']) for (const source of gifSources) {
    assert.ok(gifTranslations[locale][source]);assert.deepEqual(gifTranslations[locale][source].match(/\{\w+\}/g) ?? [], source.match(/\{\w+\}/g) ?? []);
  }
});
