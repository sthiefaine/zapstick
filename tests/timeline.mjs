import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), cache = new Map(), nodeRequire = createRequire(import.meta.url);
function loadTS(file) {
 const absolute = path.resolve(root, file);
 if (cache.has(absolute)) return cache.get(absolute).exports;
 const module = { exports: {} }; cache.set(absolute, module);
 const code = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
 const require = specifier => specifier.startsWith('.') ? loadTS(path.resolve(path.dirname(absolute), specifier + (path.extname(specifier) ? '' : '.ts'))) : nodeRequire(specifier);
 new Function('require', 'module', 'exports', code)(require, module, module.exports); return module.exports;
}
const { normalizeTrim, moveTrimHandle, gifFrameTimings, frameIndexAt, formatTimelineTime } = loadTS('lib/stickers/timeline.ts');
test('trim bounds respect media duration, the six-second maximum and very short GIFs', () => {
 assert.deepEqual(normalizeTrim(20, 0, 99), { start: 0, duration: 6 });
 assert.deepEqual(normalizeTrim(20, 19, 3), { start: 17, duration: 3 });
 assert.deepEqual(normalizeTrim(.04, 2, 3), { start: 0, duration: .04 });
 assert.deepEqual(normalizeTrim(0, 2, 3), { start: 0, duration: 0 });
 assert.deepEqual(normalizeTrim(Infinity, NaN, Infinity), { start: 0, duration: 0 });
 assert.deepEqual(normalizeTrim(2, -10, -3), { start: 0, duration: .1 });
});
test('both trim handles can travel across long media without inverting or exceeding six seconds', () => {
 for (const total of [.02, .08, .2, 3, 6, 20, 120]) {
  for (const edge of ['start', 'end']) for (const value of [-100, 0, total / 2, total, total + 100, NaN]) {
   const result = moveTrimHandle(total, { start: total / 3, duration: 3 }, edge, value);
   assert.ok(result.start >= 0, JSON.stringify({ total, edge, value, result }));
   assert.ok(result.duration > 0 && result.duration <= 6 + 1e-10);
   assert.ok(result.start + result.duration <= total + 1e-10);
  }
 }
 assert.deepEqual(moveTrimHandle(20, { start: 0, duration: 3 }, 'end', 12), { start: 6, duration: 6 });
 assert.deepEqual(moveTrimHandle(20, { start: 8, duration: 6 }, 'start', 0), { start: 0, duration: 6 });
});
test('GIF timings match exporter delays and seeking selects the correct frame', () => {
 const { ends, duration } = gifFrameTimings([50, 150, 0, 10, undefined]);
 assert.deepEqual(ends, [.05, .2, .3, .32, .42]); assert.equal(duration, .42);
 assert.equal(frameIndexAt(ends, 0), 0); assert.equal(frameIndexAt(ends, .049), 0); assert.equal(frameIndexAt(ends, .05), 1); assert.equal(frameIndexAt(ends, 99), 4);
 assert.equal(frameIndexAt([], 0), -1);
 assert.equal(formatTimelineTime(59.999), '1:00.0'); assert.equal(formatTimelineTime(125.4), '2:05.4');
});
function tinyGif() {
 const header = [71,73,70,56,57,97,1,0,1,0,128,0,0,255,0,0,0,0,255];
 const frame = (delay, pixel) => [33,249,4,0,delay,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,pixel ? 76 : 68,1,0];
 return new Blob([new Uint8Array([...header, ...frame(5, 0), ...frame(15, 1), 59])], { type: 'image/gif' });
}
test('local GIF preview reads the real duration, seeks forward and backward and disposes canvases', async () => {
 const originalDocument = globalThis.document, originalImageData = globalThis.ImageData, canvases = [];
 class FakeImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } }
 function canvas() {
  const element = { width: 300, height: 150, pixel: [0,0,0,0] };
  element.getContext = () => ({ clearRect() { element.pixel = [0,0,0,0]; }, putImageData(image) { element.pixel = [...image.data.slice(0, 4)]; }, getImageData() { return new FakeImageData(new Uint8ClampedArray(element.pixel), 1, 1); }, drawImage(source) { element.pixel = [...source.pixel]; } });
  element.toDataURL = () => 'data:image/webp;base64,' + Buffer.from(element.pixel).toString('base64'); canvases.push(element); return element;
 }
 globalThis.document = { createElement(type) { assert.equal(type, 'canvas'); return canvas(); } }; globalThis.ImageData = FakeImageData;
 try {
  const { createAnimationPreview } = loadTS('lib/stickers/animation-preview.ts');
  const controller = new AbortController(), preview = await createAnimationPreview(tinyGif(), controller.signal), target = canvas(); target.width = target.height = 0;
  assert.equal(preview.duration, .2); assert.equal(preview.thumbnails.length, 8);
  await preview.drawAt(target, .08); assert.deepEqual(target.pixel, [0,0,255,255]);
  await preview.drawAt(target, .01); assert.deepEqual(target.pixel, [255,0,0,255]);
  preview.dispose(); assert.ok(canvases.slice(0, 3).every(item => item.width === 0 && item.height === 0));
  await assert.rejects(createAnimationPreview(tinyGif(), AbortSignal.abort()), { name: 'AbortError' });
 } finally { globalThis.document = originalDocument; globalThis.ImageData = originalImageData; }
});
