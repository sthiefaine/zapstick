import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), nodeRequire = createRequire(import.meta.url);
function loadAudio(mediabunny) {
 const loaded = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/stickers/audio.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
 new Function('require', 'module', 'exports', code)(name => name === 'mediabunny' && mediabunny ? mediabunny : nodeRequire(name), loaded, loaded.exports);
 return loaded.exports;
}
class BufferAudio {
 constructor({ numberOfChannels, length, sampleRate }) { this.numberOfChannels = numberOfChannels; this.length = length; this.sampleRate = sampleRate; this.duration = length / sampleRate; this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length)); }
 getChannelData(channel) { return this.data[channel]; }
 copyToChannel(data, channel, at = 0) { this.data[channel].set(data, at); }
 copyFromChannel(data, channel, at = 0) { data.set(this.data[channel].subarray(at, at + data.length)); }
}
function source(samples, sampleRate = 8000, channels = 1) {
 const buffer = new BufferAudio({ numberOfChannels: channels, length: samples.length, sampleRate });
 for (const data of buffer.data) data.set(samples);
 return { buffer, blob: new Blob(), name: 'test', source: 'file' };
}
const audio = loadAudio();
test('audio window maps positive delays, negative clipping and source trim onto exact samples', () => {
 const plan = (recipe, duration = 4, size = 80, rate = 10) => audio.planAudioWindow(size, rate, { ...audio.defaultAudioRecipe, ...recipe }, duration);
 assert.deepEqual(plan({ start: 1, offset: 1 }), { length: 40, sourceStart: 10, targetStart: 10, count: 30, volume: 1, fadeSamples: 0 });
 assert.deepEqual(plan({ start: 1, offset: -1 }), { length: 40, sourceStart: 20, targetStart: 0, count: 40, volume: 1, fadeSamples: 0 });
 assert.equal(plan({ offset: 9 }).count, 0);
 assert.equal(plan({ start: 8 }).count, 0);
 assert.equal(plan({ start: 7 }).count, 10);
 assert.equal(plan({}, 99).length, 60);
 assert.equal(plan({}, 1.23456, 48000 * 3, 48000).length, Math.round(1.23456 * 48000));
 assert.throws(() => plan({}, NaN), /durée audio/);
 assert.throws(() => plan({}, 0), /durée audio/);
});
test('an explicit source excerpt ends before later samples even when shifted before zero', () => {
 const plan = recipe => audio.planAudioWindow(80000, 20000, {...audio.defaultAudioRecipe, ...recipe}, 3);
 assert.deepEqual(plan({start: 1, duration: .5, offset: .25}), {length: 60000, sourceStart: 20000, targetStart: 5000, count: 10000, volume: 1, fadeSamples: 60});
 assert.equal(plan({start: 1, duration: .5, offset: -.2}).sourceStart, 24000);
 assert.equal(plan({start: 1, duration: .5, offset: -.2}).count, 6000);
 assert.equal(plan({start: 1, duration: .5, offset: -.75}).count, 0);
 assert.equal(plan({start: 1, duration: 0}).count, 0);
 assert.equal(plan({start: 1, duration: -.5}).count, 0);
 assert.equal(plan({start: 1, duration: undefined}).count, 60000);
 assert.equal(plan({start: 1, duration: NaN}).count, 60000);
});
test('sequence arrangement splits a full first clip, preserves chosen short clips and bounds tiny timelines', () => {
 const recipe = audio.defaultAudioRecipe;
 assert.deepEqual(audio.arrangeAudioSequence(recipe, recipe, 6, 30, 30).map(({offset,duration}) => ({offset,duration})), [{offset: 0, duration: 3}, {offset: 3, duration: 3}]);
 const [first, second] = audio.arrangeAudioSequence({...recipe, start: .5, offset: 1, duration: 1.2}, {...recipe, start: 1, duration: .7}, 6, 3, 4);
 assert.equal(first.offset, 1); assert.equal(first.start, .5); assert.equal(first.duration, 1.2);
 assert.equal(second.offset, 2.2); assert.equal(second.start, 1); assert.equal(second.duration, .7);
 const [negative, next] = audio.arrangeAudioSequence({...recipe, start: .5, offset: -2}, recipe, 3, 2, 9);
 assert.equal(negative.offset, 0); assert.equal(negative.duration, 1.5); assert.equal(next.offset, 1.5); assert.equal(next.duration, 1.5);
 for (const length of [.001, .04, .08, .1, .7, 3, 6, 9]) for (const offset of [-2, 0, .02, length, length + 3]) {
  const [a, b] = audio.arrangeAudioSequence({...recipe, offset}, recipe, length, 8, 8), end = Math.min(6, length);
  assert.ok(a.offset >= 0 && a.duration > 0 && b.duration > 0);
  assert.equal(b.offset, a.offset + a.duration);
  assert.ok(b.offset + b.duration <= end + 1e-10);
 }
 const [,empty] = audio.arrangeAudioSequence(recipe, {...recipe, start: 5}, 1, 1, 3);
 assert.equal(empty.duration, 0); assert.equal(empty.start, 3);
});
test('actual sequential PCM changes from the first sound to the second without overlapping their excerpts', () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const firstTrack = source(new Float32Array(40000).fill(.2), 20000), secondTrack = source(new Float32Array(96000).fill(-.3), 48000);
  const [first, second] = audio.arrangeAudioSequence({start: .2, offset: .25, volume: 1, duration: .5}, {start: .1, offset: 0, volume: 1, duration: .75}, 1.5, 2, 2);
  const output = audio.renderAudioMix([{track: firstTrack, recipe: first}, {track: secondTrack, recipe: second}], 1.5), samples = output.getChannelData(0);
  assert.ok(samples.subarray(0, 12000).every(sample => sample === 0));
  assert.ok(Math.abs(samples[24000] - .2) < .00001); assert.ok(Math.abs(samples[48000] + .3) < .00001);
  assert.ok(samples.subarray(0, 36000).every(sample => sample >= 0));
  assert.ok(samples.subarray(36000).every(sample => sample <= 0));
  const negative = audio.renderAudio(firstTrack, {start: .2, offset: -.2, volume: 1, duration: .5}, 1);
  assert.ok(Math.abs(negative.getChannelData(0)[2000] - .2) < .00001);
  assert.ok(negative.getChannelData(0).subarray(6000).every(sample => sample === 0), 'negative offset does not expose audio after the selected excerpt');
  const tiny = audio.arrangeAudioSequence(audio.defaultAudioRecipe, audio.defaultAudioRecipe, .04, 2, 2);
  const short = audio.renderAudioMix([{track: firstTrack, recipe: tiny[0]}, {track: secondTrack, recipe: tiny[1]}], .04).getChannelData(0);
  assert.ok(short.subarray(0, 960).some(sample => sample > .1)); assert.ok(short.subarray(960).some(sample => sample < -.1));
 } finally { globalThis.AudioBuffer = previous; }
});
test('sample rendering preserves silence gaps, fades only audible boundaries and leaves source untouched', () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const track = source(new Float32Array(8000).fill(.8)), output = audio.renderAudio(track, { start: .25, offset: .5, volume: .5 }, 1.5);
  assert.equal(output.length, 12000); assert.equal(output.duration, 1.5);
  const data = output.getChannelData(0);
  assert.ok(data.subarray(0, 4000).every(sample => sample === 0));
  assert.equal(data[4000], 0); assert.ok(Math.abs(data[4024] - .4) < .00001);
  assert.equal(data[9999], 0); assert.ok(data.subarray(10000).every(sample => sample === 0));
  assert.ok(track.buffer.getChannelData(0).every(sample => Math.abs(sample - .8) < .00001));
  const ramp = source(Float32Array.from({ length: 8000 }, (_, i) => i / 8000)), clipped = audio.renderAudio(ramp, { start: .1, offset: -.2, volume: 1 }, .5);
  assert.ok(Math.abs(clipped.getChannelData(0)[800] - .4) < .00001);
  const silent = audio.renderAudio(track, { start: 0, offset: 10, volume: 1 }, .5);
  assert.ok(silent.getChannelData(0).every(sample => sample === 0));
  assert.equal(audio.renderAudio(track, audio.defaultAudioRecipe, 9).length, 48000);
 } finally { globalThis.AudioBuffer = previous; }
});
test('two independently trimmed and shifted layers share the 48 kHz output grid', () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const voice = source(Float32Array.from({length: 8000}, (_, i) => i / 20000)), music = source(new Float32Array(22050).fill(.2), 22050);
  const layers = [
   {track: voice, recipe: {start: .1, offset: -.2, volume: 1}},
   {track: music, recipe: {start: 0, offset: .5, volume: .5}},
  ];
  const mixed = audio.renderAudioMix(layers, 1.5), samples = mixed.getChannelData(0);
  assert.equal(mixed.sampleRate, 48000); assert.equal(mixed.length, 72000); assert.equal(mixed.numberOfChannels, 1);
  assert.equal(samples[0], 0);
  assert.ok(Math.abs(samples[9600] - .2) < .00001, 'negative offset skips the beginning of the first source');
  assert.ok(Math.abs(samples[31200] - .48) < .00001, 'each layer uses its own excerpt, offset and volume');
  assert.ok(Math.abs(samples[38400] - .1) < .00001, 'the first source ends independently; the delayed second stays audible');
  assert.equal(samples[samples.length - 1], 0);
  assert.equal(layers[0].recipe.start, .1); assert.equal(layers[1].recipe.offset, .5);
  assert.ok(Math.abs(voice.buffer.getChannelData(0)[4000] - .2) < .00001);
 } finally { globalThis.AudioBuffer = previous; }
});
test('mixed sample rates retain stereo balance and duplicate mono without changing its level', () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const mono = source(new Float32Array(48000).fill(.2), 48000), stereo = source(new Float32Array(44100).fill(.1), 44100, 2);
  stereo.buffer.data[1].fill(-.2);
  const mixed = audio.renderAudioMix([
   {track: mono, recipe: {start: 0, offset: .1, volume: .5}},
   {track: stereo, recipe: {start: 0, offset: .2, volume: .8}},
  ], 1);
  assert.equal(mixed.numberOfChannels, 2); assert.equal(mixed.sampleRate, 48000);
  const left = mixed.getChannelData(0), right = mixed.getChannelData(1);
  assert.equal(left[4000], 0); assert.equal(right[4000], 0);
  assert.ok(Math.abs(left[7200] - .1) < .00001); assert.ok(Math.abs(right[7200] - .1) < .00001);
  assert.ok(Math.abs(left[24000] - .18) < .00001); assert.ok(Math.abs(right[24000] + .06) < .00001);
  const highRate = source(Float32Array.from({length: 96000}, (_, i) => i / 192000), 96000);
  const resampled = audio.renderAudioMix([{track: highRate, recipe: audio.defaultAudioRecipe}], 1);
  assert.ok(Math.abs(resampled.getChannelData(0)[12000] - .125) < .00001);
 } finally { globalThis.AudioBuffer = previous; }
});
test('mixing only scales overloaded peaks, preserving quiet tracks, mute and stereo ratios', () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const stereo = source(new Float32Array(48000).fill(.8), 48000, 2), mono = source(new Float32Array(24000).fill(.8), 24000);
  stereo.buffer.data[1].fill(.4);
  const first = {track: stereo, recipe: {...audio.defaultAudioRecipe}}, second = {track: mono, recipe: {...audio.defaultAudioRecipe}};
  const alone = audio.renderAudioMix([first], 1), mixed = audio.renderAudioMix([first, second], 1);
  assert.ok(Math.abs(alone.getChannelData(0)[24000] - .8) < .00001, 'one sound is not halved');
  assert.ok(Math.abs(mixed.getChannelData(0)[24000] - 1) < .00001);
  assert.ok(Math.abs(mixed.getChannelData(1)[24000] - .75) < .00001, 'the same limiter gain keeps stereo balance');
  for (const channel of mixed.data) assert.ok(channel.every(sample => Number.isFinite(sample) && Math.abs(sample) <= 1));
  const muted = audio.renderAudioMix([first, {...second, recipe: {...second.recipe, volume: 0}}], 1);
  assert.deepEqual(muted.getChannelData(0), alone.getChannelData(0));
  assert.ok(stereo.buffer.getChannelData(0).every(sample => Math.abs(sample - .8) < .00001));
 } finally { globalThis.AudioBuffer = previous; }
});
test('mixing keeps short tails silent, caps duration and rejects unsupported layer layouts', () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const track = source(new Float32Array(400).fill(.3), 8000), layer = {track, recipe: audio.defaultAudioRecipe};
  const mixed = audio.renderAudioMix([layer], 9);
  assert.equal(mixed.length, 288000); assert.equal(mixed.duration, 6);
  assert.ok(mixed.getChannelData(0).subarray(2400).every(sample => sample === 0));
  assert.ok(audio.renderAudioMix([], .25).getChannelData(0).every(sample => sample === 0));
  assert.throws(() => audio.renderAudioMix([layer, layer, layer], 1), /deux pistes/);
  assert.throws(() => audio.renderAudioMix([layer], Infinity), /durée audio/);
  assert.throws(() => audio.renderAudioMix([{...layer, track: source([.2], 8000, 3)}], 1), /format audio/);
 } finally { globalThis.AudioBuffer = previous; }
});
test('WAV output has correct stereo interleaving, lengths and signed PCM clipping', async () => {
 const buffer = source([0, .5, -1, 2], 8000, 2).buffer; buffer.data[1].set([1, -.5, 0, -2]);
 const blob = audio.encodeWav(buffer), bytes = await blob.arrayBuffer(), view = new DataView(bytes);
 assert.equal(blob.type, 'audio/wav'); assert.equal(bytes.byteLength, 60);
 assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), 'RIFF'); assert.equal(Buffer.from(bytes).subarray(8, 12).toString(), 'WAVE');
 assert.equal(view.getUint32(4, true), 52); assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 8000); assert.equal(view.getUint32(28, true), 32000); assert.equal(view.getUint32(40, true), 16);
 assert.deepEqual(Array.from({ length: 8 }, (_, i) => view.getInt16(44 + i * 2, true)), [0, 32767, 16384, -16384, -32768, 0, 32767, -32768]);
 assert.throws(() => audio.encodeWav(source(new Float32Array(48001), 8000).buffer), /durée audio/);
});
test('waveform keeps short impulses and combines stereo without normalizing quiet audio', () => {
 const buffer = source([0, .1, .6, 0, 0, 0, 0, 0], 8000, 2).buffer; buffer.data[1][7] = -.8;
 const peaks = audio.getWaveform(buffer, 4);
 assert.deepEqual(peaks.map(value => Math.round(value * 10)), [1, 6, 0, 8]);
 assert.ok(audio.getWaveform(source(new Float32Array(20)).buffer).every(value => value === 0));
 assert.equal(audio.getWaveform(buffer, Infinity).length, 80);
});
test('clearing sound work handles unregistration, exceptions and one-shot cleanup', () => {
 let calls = 0; const unregister = audio.registerAudioWork(() => { calls += 100; }); unregister();
 audio.registerAudioWork(() => { throw new Error('cleanup failed'); }); audio.registerAudioWork(() => { calls++; });
 audio.stopAllAudioWork(); audio.stopAllAudioWork(); assert.equal(calls, 1);
});
function demux({ duration = 1, metadata = duration, parts = [], canDecode = true, track = true, pending } = {}) {
 const status = { disposed: 0, decodeQueries: 0, returned: 0 };
 const media = { ALL_FORMATS: [], BlobSource: class { constructor(blob) { this.blob = blob; } }, Input: class {
  async getPrimaryAudioTrack() { if (pending) await pending; return track ? { getDurationFromMetadata: async () => metadata, computeDuration: async () => duration, canDecode: async () => { status.decodeQueries++; return canDecode; } } : null; }
  dispose() { status.disposed++; }
 }, AudioBufferSink: class {
  buffers() { let i = 0; return { async next() { return i < parts.length ? { done: false, value: parts[i++] } : { done: true }; }, async return() { status.returned++; return { done: true }; } }; }
 } };
 return { status, media };
}
test('audio preflight rejects oversized and long inputs before any sample decode and reports absent tracks', async () => {
 const long = demux({ duration: 31 }), missing = demux({ track: false });
 await assert.rejects(loadAudio(long.media).decodeAudio(new Blob(['test'], { type: 'audio/mpeg' })), /30 secondes/);
 assert.equal(long.status.decodeQueries, 0); assert.equal(long.status.disposed, 1);
 await assert.rejects(loadAudio(missing.media).decodeAudio(new Blob(['test'], { type: 'video/mp4' })), /Aucun son/);
 const tooBig = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'audio/wav' });
 await assert.rejects(audio.decodeAudio(tooBig), /5 Mo/);
 await assert.rejects(audio.decodeAudio(new Blob(['test']), { signal: AbortSignal.abort() }), { name: 'AbortError' });
});
test('bounded audio decoding preserves positive timestamps and clips samples before timeline zero', async () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const part = source(new Float32Array(4000).fill(.5)).buffer, fixture = demux({ duration: 1, metadata: null, parts: [{ buffer: part, timestamp: .25 }] });
  const track = await loadAudio(fixture.media).decodeAudio(new Blob(['mp4'], { type: 'video/mp4' }), { source: 'original', name: 'Original' });
  assert.equal(track.buffer.length, 8000); assert.equal(track.name, 'Original'); assert.equal(track.source, 'original');
  assert.equal(track.buffer.getChannelData(0)[1999], 0); assert.equal(track.buffer.getChannelData(0)[2000], .5); assert.equal(track.buffer.getChannelData(0)[6000], 0);
  assert.equal(fixture.status.returned, 1); assert.equal(fixture.status.disposed, 1);
  const negative = demux({ duration: .25, parts: [{ buffer: part, timestamp: -.25 }] });
  const clipped = await loadAudio(negative.media).decodeAudio(new Blob(['sound']));
  assert.equal(clipped.buffer.length, 2000); assert.ok(clipped.buffer.getChannelData(0).every(sample => sample === .5));
 } finally { globalThis.AudioBuffer = previous; }
});
test('a cancelled metadata read rejects promptly and disposes a late decoder input', async () => {
 let grant; const fixture = demux({ pending: new Promise(resolve => { grant = resolve; }) }), decoder = loadAudio(fixture.media), controller = new AbortController();
 const promise = decoder.decodeAudio(new Blob(['mp4'], { type: 'video/mp4' }), { signal: controller.signal });
 await new Promise(resolve => setImmediate(resolve));
 const rejected = assert.rejects(promise, { name: 'AbortError' }); controller.abort(); await rejected; grant();
 assert.ok(fixture.status.disposed > 0); assert.equal(fixture.status.decodeQueries, 0);
});
test('real Mediabunny WAV parsing and decoding round-trips normalized samples', async () => {
 const previous = globalThis.AudioBuffer; globalThis.AudioBuffer = BufferAudio;
 try {
  const original = source([0, .25, -.5, .75, 0], 8000).buffer;
  const decoded = await audio.decodeAudio(audio.encodeWav(original), { name: 'Réel' });
  assert.equal(decoded.buffer.sampleRate, 8000); assert.equal(decoded.buffer.length, 5);
  assert.ok(Math.abs(decoded.buffer.getChannelData(0)[3] - .75) < .00004);
 } finally { globalThis.AudioBuffer = previous; }
});
