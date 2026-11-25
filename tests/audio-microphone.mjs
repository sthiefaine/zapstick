import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function environment({ permission, mime = 'audio/webm;codecs=opus', autoStart = true } = {}) {
 const saved = Object.fromEntries(['window', 'document', 'navigator', 'MediaRecorder'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
 const doc = new EventTarget(); doc.hidden = false; const win = new EventTarget(); win.isSecureContext = true;
 const status = { requested: 0, stoppedTracks: 0, recorder: null }, registry = new Set();
 const stream = { getTracks: () => [{ stop() { status.stoppedTracks++; } }] };
 class Recorder {
  static isTypeSupported(type) { return type === mime; }
  constructor(value, options = {}) { this.stream = value; this.mimeType = options.mimeType || mime; this.state = 'inactive'; status.recorder = this; }
  start() { this.state = 'recording'; if (autoStart) queueMicrotask(() => this.onstart?.()); }
  stop() { if (this.state === 'inactive') throw new Error('inactive'); this.state = 'inactive'; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['recording'], { type: this.mimeType }) }); this.onstop?.(); }); }
 }
 for (const [name, value] of Object.entries({ window: win, document: doc, navigator: { mediaDevices: { getUserMedia() { status.requested++; return permission || Promise.resolve(stream); } } }, MediaRecorder: Recorder })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
 const loaded = { exports: {} }, code = ts.transpileModule(fs.readFileSync(path.join(root, 'lib/stickers/microphone.ts'), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
 new Function('require', 'module', 'exports', code)(() => ({ registerAudioWork(stop) { registry.add(stop); return () => registry.delete(stop); } }), loaded, loaded.exports);
 return { create: loaded.exports.createMicrophoneSession, doc, win, status, stream, registry, restore() { for (const [name, descriptor] of Object.entries(saved)) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('creating a microphone session never requests permission and manual Stop returns the actual MIME', async () => {
 const env = environment(), states = [], elapsed = [];
 try {
  const session = env.create({ onState: state => states.push(state), onElapsed: value => elapsed.push(value) });
  assert.equal(env.status.requested, 0);
  const recorded = session.record(); await tick(); assert.equal(env.status.requested, 1); assert.equal(env.status.recorder.state, 'recording');
  session.stop(); const blob = await recorded;
  assert.equal(blob.type, 'audio/webm;codecs=opus'); assert.equal(await blob.text(), 'recording'); assert.ok(env.status.stoppedTracks > 0);
  assert.deepEqual(states, ['waiting', 'recording', 'idle']); assert.equal(elapsed[0], 0); assert.equal(env.registry.size, 0);
 } finally { env.restore(); }
});
test('cancel during permission request rejects immediately and stops a stream granted later', async () => {
 let grant; const env = environment({ permission: new Promise(resolve => { grant = resolve; }) });
 try {
  const session = env.create(), pending = session.record(), rejected = assert.rejects(pending, { name: 'AbortError' }); session.cancel(); await rejected;
  grant(env.stream); await tick(); assert.equal(env.status.stoppedTracks, 1); assert.equal(env.status.recorder, null); assert.equal(env.registry.size, 0);
 } finally { env.restore(); }
});
test('Stop while permission is pending cancels the future take', async () => {
 let grant; const env = environment({ permission: new Promise(resolve => { grant = resolve; }) });
 try {
  const session = env.create(), pending = session.record(), rejected = assert.rejects(pending, { name: 'AbortError' }); session.stop(); await rejected;
  grant(env.stream); await tick(); assert.equal(env.status.recorder, null); assert.equal(env.status.stoppedTracks, 1);
 } finally { env.restore(); }
});
test('abort, pagehide, hidden document and registry clearing each release a live microphone', async () => {
 for (const reason of ['abort', 'pagehide', 'hidden', 'clear']) {
  const env = environment();
  try {
   const controller = new AbortController(), session = env.create(), pending = session.record(controller.signal); await tick();
   const rejected = assert.rejects(pending, { name: 'AbortError' });
   if (reason === 'abort') controller.abort();
   if (reason === 'pagehide') env.win.dispatchEvent(new Event('pagehide'));
   if (reason === 'hidden') { env.doc.hidden = true; env.doc.dispatchEvent(new Event('visibilitychange')); }
   if (reason === 'clear') for (const cancel of env.registry) cancel();
   await rejected; assert.ok(env.status.stoppedTracks > 0, reason); assert.equal(env.registry.size, 0);
  } finally { env.restore(); }
 }
});
test('recording finishes automatically at six seconds and the session can be reused', async context => {
 const env = environment(); context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
 try {
  const session = env.create(), pending = session.record(); await tick(); context.mock.timers.tick(6000); const blob = await pending;
  assert.ok(blob.size > 0); assert.ok(env.status.stoppedTracks > 0); assert.equal(env.registry.size, 0);
  const next = session.record(); await tick(); session.stop(); assert.ok((await next).size > 0); assert.equal(env.status.requested, 2);
 } finally { env.restore(); }
});
test('recording waits for actual onstart and counts six seconds from that event', async context => {
 const env = environment({ autoStart: false }), states = [], elapsed = []; let now = 1000;
 context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] }); context.mock.method(performance, 'now', () => now);
 try {
  const session = env.create({ onState: state => states.push(state), onElapsed: seconds => elapsed.push(seconds) }), pending = session.record(); await tick();
  assert.deepEqual(states, ['waiting']); assert.deepEqual(elapsed, [0]);
  now += 2000; context.mock.timers.tick(2000); assert.equal(env.status.stoppedTracks, 0); assert.deepEqual(elapsed, [0]);
  env.status.recorder.onstart(); assert.deepEqual(states, ['waiting', 'recording']);
  now += 1000; context.mock.timers.tick(1000); assert.equal(elapsed.at(-1), 1);
  now += 4999; context.mock.timers.tick(4999); assert.equal(env.status.stoppedTracks, 0);
  now++; context.mock.timers.tick(1); const blob = await pending;
  assert.ok(blob.size > 0); assert.equal(elapsed.at(-1), 6); assert.deepEqual(states, ['waiting', 'recording', 'idle']);
 } finally { env.restore(); }
});
test('a recorder that never starts times out after five seconds and releases capture', async context => {
 const env = environment({ autoStart: false }), states = [];
 context.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
 try {
  const session = env.create({ onState: state => states.push(state) }), pending = session.record(); await tick();
  const rejected = assert.rejects(pending, /microphone est indisponible/); context.mock.timers.tick(4999); assert.equal(env.status.stoppedTracks, 0);
  context.mock.timers.tick(1); await rejected;
  assert.ok(env.status.stoppedTracks > 0); assert.deepEqual(states, ['waiting', 'idle']); assert.equal(env.status.recorder.onstart, null); assert.equal(env.registry.size, 0);
 } finally { env.restore(); }
});
test('Stop during asynchronous recorder startup cancels and ignores late start events', async () => {
 const env = environment({ autoStart: false }), states = [];
 try {
  const session = env.create({ onState: state => states.push(state) }), pending = session.record(); await tick();
  const lateStart = env.status.recorder.onstart, rejected = assert.rejects(pending, { name: 'AbortError' }); session.stop(); await rejected;
  lateStart(); await tick(); assert.deepEqual(states, ['waiting', 'idle']); assert.ok(env.status.stoppedTracks > 0); assert.equal(env.registry.size, 0);
 } finally { env.restore(); }
});
test('denied permission gives a French error and concurrent/pre-aborted recording does not request again', async () => {
 const error = new DOMException('denied', 'NotAllowedError'), denied = environment({ permission: Promise.reject(error) });
 try { await assert.rejects(denied.create().record(), /Autorise le microphone/); assert.equal(denied.registry.size, 0); } finally { denied.restore(); }
 let grant; const env = environment({ permission: new Promise(resolve => { grant = resolve; }) });
 try {
  const session = env.create(); await assert.rejects(session.record(AbortSignal.abort()), { name: 'AbortError' }); assert.equal(env.status.requested, 0);
  const first = session.record(), rejected = assert.rejects(first, { name: 'AbortError' }); await assert.rejects(session.record(), /déjà en cours/); session.cancel(); await rejected; grant(env.stream); await tick(); assert.equal(env.status.requested, 1);
 } finally { env.restore(); }
});
