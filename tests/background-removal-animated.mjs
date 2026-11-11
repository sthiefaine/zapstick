import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function loader(overrides = {}) {
  const cache = new Map();
  return function load(file) {
    const absolute = path.resolve(root, file);if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = {exports: {}};cache.set(absolute, module);
    const source = fs.readFileSync(absolute, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(absolute).href));
    const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('.') ? load(path.resolve(path.dirname(absolute), name + (path.extname(name) ? '' : '.ts'))) : require(name);
    new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);return module.exports;
  };
}
const load = loader(), core = load('lib/stickers/background-removal-core.ts');
const {removeImageBackground, removeAnimatedBackground, clearBackgroundModelCache} = load('lib/stickers/background-removal.ts');
const {muxWebp} = load('lib/stickers/webp-mux.ts'), {parseWebpAnimation} = load('lib/stickers/webp-animation.ts');
const digest = Uint8Array.from(core.BACKGROUND_MODEL_SHA256.match(/../g), value => parseInt(value, 16));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function browser(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {value, writable: true, configurable: true});
  try {return await run();} finally {for (const [key, value] of Object.entries(previous)) if (value) Object.defineProperty(globalThis, key, value);else delete globalThis[key];}
}
const supports = {window: {}, Worker: class {}, OffscreenCanvas: class {}, createImageBitmap: () => {}, crypto: {subtle: {digest: async () => digest.buffer}}};
const cached = {open: async () => ({match: async () => new Response(new Uint8Array(core.BACKGROUND_MODEL_BYTES))}), delete: async () => true};
const sharp = require('sharp');
const still = await sharp({create: {width: 512, height: 512, channels: 4, background: {r: 240, g: 30, b: 20, alpha: 1}}}).webp({lossless: true}).toBuffer();
const source = muxWebp([{bytes: still, duration: 125}, {bytes: still, duration: 125}], {loopCount: 3});

test('72 source frames are accepted and resampled within 8fps/48 outputs without changing loop duration', () => {
  const animation = {width: 512, height: 512, frames: Array.from({length: 72}, () => ({durationMs: 83}))}, plan = core.planBackgroundAnimation(animation);
  assert.ok(plan.samples.length <= 48);assert.ok(plan.samples.length / (plan.durationMs / 1000) <= 8);
  assert.equal(plan.samples[0].sourceIndex, 0);assert.equal(plan.samples.at(-1).sourceIndex, 71);
  assert.equal(plan.samples.reduce((sum, sample) => sum + sample.durationMs, 0), 72 * 83);
  assert.ok(plan.samples.every((sample, index) => sample.durationMs >= 125 && (!index || sample.sourceIndex > plan.samples[index - 1].sourceIndex)));
  const held = core.planBackgroundAnimation({width: 512, height: 512, frames: [{durationMs: 5899}, {durationMs: 101}]});
  assert.equal(held.samples.length, 2);assert.equal(held.samples.reduce((sum, sample) => sum + sample.durationMs, 0), 6000);
  assert.throws(() => core.planBackgroundAnimation({...animation, width: 1024}), error => error.code === 'invalid-animation');
  assert.throws(() => core.planBackgroundAnimation({...animation, frames: [{durationMs: 3000}, {durationMs: 3001}]}), error => error.code === 'animation-too-large');
});

test('invalid animated input is rejected before cache access, model requests or worker creation', async () => {
  let cache = 0, requests = 0, workers = 0;
  await browser({...supports, caches: {open: async () => {cache++;}}, fetch: async () => {requests++;}, Worker: class {constructor() {workers++;}}}, async () => {
    await assert.rejects(removeAnimatedBackground(new Blob(['invalid'], {type: 'image/webp'})), error => error.code === 'invalid-animation');
    const tooLong = muxWebp([{bytes: still, duration: 3000}, {bytes: still, duration: 3001}]);
    await assert.rejects(removeAnimatedBackground(tooLong), error => error.code === 'animation-too-large');
  });
  assert.equal(cache, 0);assert.equal(requests, 0);assert.equal(workers, 0);
});

test('cached animation sends frame progress, while erasure cancels it and prevents static/animated overlap', async () => {
  let worker, terminated = 0, network = 0;const events = [], progress = [];
  class FakeWorker {constructor() {worker = this;}postMessage(data) {assert.equal(data.kind, 'animated');this.onmessage({data: {type: 'progress', progress: {stage: 'processing', percent: 50}}});}terminate() {terminated++;events.push('stop');}}
  await browser({...supports, Worker: FakeWorker, fetch: async () => {network++;}, caches: {...cached, delete: async () => {events.push('delete');return true;}}}, async () => {
    const job = removeAnimatedBackground(source, {onProgress: value => progress.push(value)}), outcome = job.catch(error => error);
    for (let attempt = 0; attempt < 100 && !worker; attempt++) await tick();assert.ok(worker);
    await assert.rejects(removeAnimatedBackground(source), error => error.code === 'busy');
    await assert.rejects(removeImageBackground(new Blob()), error => error.code === 'busy');
    await clearBackgroundModelCache();assert.equal((await outcome).code, 'cancelled');
    assert.ok(progress.some(value => value.stage === 'processing' && value.percent === 50));
    assert.equal(worker.onmessage, null);
  });
  assert.equal(network, 0);assert.equal(terminated, 1);assert.deepEqual(events, ['stop', 'delete']);
});

test('animated timeout terminates pending work; abort before start does not create a worker', async () => {
  let workers = 0, terminated = 0;
  await browser({...supports, caches: cached, Worker: class {constructor() {workers++;}postMessage() {}terminate() {terminated++;}}}, async () => {
    const controller = new AbortController();controller.abort();
    await assert.rejects(removeAnimatedBackground(source, {signal: controller.signal}), error => error.code === 'cancelled');assert.equal(workers, 0);
    await assert.rejects(removeAnimatedBackground(source, {timeoutMs: 25}), error => error.code === 'timeout');
    assert.equal(terminated, workers);
  });
});

class Canvas {
  _width = 0;_height = 0;data = new Uint8ClampedArray();context;
  constructor(width, height) {this.width = width;this.height = height;}
  get width() {return this._width;}set width(value) {this._width = value;this.data = new Uint8ClampedArray(this._width * this._height * 4);}
  get height() {return this._height;}set height(value) {this._height = value;this.data = new Uint8ClampedArray(this._width * this._height * 4);}
  getContext() {
    if (this.context) return this.context;const canvas = this;
    return this.context = {
      globalCompositeOperation: 'source-over',
      clearRect() {canvas.data.fill(0);},
      fillRect() {for (let at = 0; at < canvas.data.length; at += 4) canvas.data.set([0, 0, 0, 255], at);},
      drawImage(source, x, y, width = source.width, height = source.height) {
        for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
          const from = (Math.floor(row * source.height / height) * source.width + Math.floor(column * source.width / width)) * 4, to = ((row + y) * canvas.width + column + x) * 4;
          if (this.globalCompositeOperation === 'destination-in') canvas.data[to + 3] = Math.round(canvas.data[to + 3] * source.data[from + 3] / 255);
          else canvas.data.set(source.data.subarray(from, from + 4), to);
        }
      },
      getImageData() {return {data: canvas.data.slice()};},
      putImageData(image) {canvas.data.set(image.data);},
    };
  }
  async convertToBlob({type, quality} = {}) {
    if (!this.context) throw new DOMException('OffscreenCanvas has no rendering context', 'InvalidStateError');
    const image = sharp(this.data, {raw: {width: this.width, height: this.height, channels: 4}});
    return new Blob([await (type === 'image/webp' ? image.webp({quality: Math.round((quality ?? .8) * 100)}) : image.png()).toBuffer()], {type: type ?? 'image/png'});
  }
}
const imageGlobals = {OffscreenCanvas: Canvas, ImageData: class {constructor(data, width, height) {Object.assign(this, {data, width, height});}}, createImageBitmap: async blob => {
  const {data, info} = await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  return {width: info.width, height: info.height, data, close() {}};
}};

test('animated worker uses one session, disposes every tensor and emits real WebP with fractional alpha and original loop/duration', async () => {
  let sessions = 0, releases = 0, inputs = 0, outputs = 0, runs = 0;const messages = [];
  class Tensor {constructor(type, data) {this.data = data;inputs++;}dispose() {inputs--;}}
  const runtime = {Tensor, env: {wasm: {}}, InferenceSession: {create: async () => {
    sessions++;return {inputNames: ['input'], outputNames: ['output'], async run() {
      runs++;const values = new Float32Array(320 * 320);for (let i = 0; i < values.length; i++) values[i] = (i % 320) / 319;outputs++;
      return {output: {data: values, dispose() {outputs--;}}};
    }, async release() {releases++;}};
  }}};
  await browser({...imageGlobals, location: new URL('https://zapstick.test'), postMessage: value => messages.push(value)}, async () => {
    loader({'onnxruntime-web/wasm': runtime})('lib/stickers/background-removal.worker.ts');
    await globalThis.onmessage({data: {blob: source, model: new ArrayBuffer(1), kind: 'animated'}});
    const result = messages.find(value => value.type === 'result');assert.ok(result, JSON.stringify(messages));assert.equal(result.blob.type, 'image/webp');
    const bytes = new Uint8Array(await result.blob.arrayBuffer()), animation = parseWebpAnimation(bytes);
    assert.equal(animation.width, 512);assert.equal(animation.height, 512);assert.equal(animation.frames.length, 2);assert.equal(animation.loopCount, 3);assert.equal(animation.frames.reduce((sum, frame) => sum + frame.durationMs, 0), 250);
    const {webpFrameBlob} = load('lib/stickers/webp-animation.ts');
    const rgba = await sharp(Buffer.from(await webpFrameBlob(bytes, animation, animation.frames[0]).arrayBuffer())).ensureAlpha().raw().toBuffer();
    assert.equal(rgba[3], 0);assert.ok(rgba[4 * 255 + 3] > 50 && rgba[4 * 255 + 3] < 200);assert.equal(rgba[4 * 511 + 3], 255);
  });
  assert.equal(sessions, 1);assert.equal(releases, 1);assert.equal(runs, 2);assert.equal(inputs, 0);assert.equal(outputs, 0);
});

test('frame processor reuses its surfaces and disposes inputs/outputs even when mask validation fails', async () => {
  let live = 0;class Tensor {constructor() {live++;}dispose() {live--;}}
  const {createBackgroundFrameProcessor} = loader({'onnxruntime-web/wasm': {Tensor}})('lib/stickers/background-removal-inference.ts');
  await browser(imageGlobals, async () => {
    const source = new Canvas(2, 2);source.data.fill(255);
    const session = {inputNames: ['in'], outputNames: ['out'], async run() {live++;return {out: {data: new Float32Array(320 * 320), dispose() {live--;}}};}};
    const processor = createBackgroundFrameProcessor(session, 512, 512);
    await assert.rejects(processor.process(source), error => error.code === 'model');assert.equal(live, 0);processor.dispose();
  });
});

test('static worker closes the camera bitmap before creating its session and still returns a transparent PNG', async () => {
  let closed = false, releases = 0, runs = 0;const messages = [];
  class Tensor {dispose() {}}
  const runtime = {Tensor, env: {wasm: {}}, InferenceSession: {create: async () => {
    assert.equal(closed, true);
    return {inputNames: ['input'], outputNames: ['output'], async run() {
      runs++;const values = new Float32Array(320 * 320);for (let i = 0; i < values.length; i++) values[i] = (i % 320) / 319;
      return {output: {data: values, dispose() {}}};
    }, async release() {releases++;}};
  }}};
  const png = new Blob([await sharp(still).png().toBuffer()], {type: 'image/png'});
  await browser({...imageGlobals, onmessage: null, location: new URL('https://zapstick.test'), postMessage: value => messages.push(value), createImageBitmap: async blob => {
    const bitmap = await imageGlobals.createImageBitmap(blob);bitmap.close = () => {closed = true;bitmap.data = new Uint8Array();};return bitmap;
  }}, async () => {
    loader({'onnxruntime-web/wasm': runtime})('lib/stickers/background-removal.worker.ts');
    await globalThis.onmessage({data: {blob: png, model: new ArrayBuffer(1), kind: 'image'}});
    const result = messages.find(value => value.type === 'result');assert.ok(result, JSON.stringify(messages));assert.equal(result.blob.type, 'image/png');
    const metadata = await sharp(Buffer.from(await result.blob.arrayBuffer())).metadata();assert.equal(metadata.width, 512);assert.equal(metadata.hasAlpha, true);
    const rgba = await sharp(Buffer.from(await result.blob.arrayBuffer())).raw().toBuffer();assert.equal(rgba[3], 0);assert.equal(rgba[4 * 511 + 3], 255);
  });
  assert.equal(runs, 1);assert.equal(releases, 1);
});
