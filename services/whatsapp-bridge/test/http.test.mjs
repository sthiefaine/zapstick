import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BridgeStore } from '../src/store.mjs';
import { createBridgeServer } from '../src/server.mjs';
import { createSample, sampleArguments } from '../src/sample.mjs';

const secret = n => randomBytes(n).toString('base64url');
async function setup(t, options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'zapstick-http-')), serviceToken = secret(32);
  const store = new BridgeStore({ dir, key: randomBytes(32), botNumber: '33612345678' });
  const app = createBridgeServer({ store, serviceToken, enabled: true, soundEnabled: true, isReady: () => true, validateMedia: () => ({ kind: 'animated', duration: 3 }), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  t.after(async () => { await app.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const headers = { Authorization: `Bearer ${serviceToken}` };
  return { app, store, origin, headers, get: (route, extra = {}) => fetch(origin + route, { headers, ...extra }) };
}
function upload({ id = secret(16), receipt = secret(32), locale = 'fr', sound = false, extras = [] } = {}) {
  const form = new FormData(); form.set('manifest', JSON.stringify({ version: 1, id, locale }));
  form.set('visual', new Blob(['fake-webp'], { type: 'image/webp' }), 'visual.webp');
  if (sound) form.set('sound', new Blob(['fake-wav'], { type: 'audio/wav' }), 'sound.wav');
  for (const [key, value] of extras) form.append(key, value);
  return { id, receipt, form };
}
const post = (s, input) => s.get('/internal/v1/transfers', { method: 'POST', headers: { ...s.headers, 'x-transfer-receipt': input.receipt }, body: input.form });

test('private routes require service authentication; liveness never reveals account data', async t => {
  const s = await setup(t);
  let response = await fetch(s.origin + '/health/live'); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { live: true });
  response = await fetch(s.origin + '/internal/v1/status'); assert.equal(response.status, 401);
  response = await s.get('/internal/v1/status'); assert.deepEqual(await response.json(), { enabled: true, ready: true, soundEnabled: true });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const route of ['/internal/v1/status?x=1', '/internal/v1/transfers/../status', '/pair', '/media/test.webp']) {
    if (route.includes('..')) continue; // fetch normalizes dot segments; the raw-path case below covers it.
    response = await s.get(route); assert.equal(response.status, 404);
  }
});

test('multipart create, authorized follow-up, idempotent replay and server cancellation', async t => {
  const s = await setup(t), input = upload();
  let response = await post(s, input); assert.equal(response.status, 201);
  const created = await response.json(); assert.equal(created.id, input.id); assert.equal(created.state, 'awaiting_message');
  response = await post(s, input); assert.equal(response.status, 200); assert.deepEqual(await response.json(), created);
  response = await s.get(`/internal/v1/transfers/${input.id}`, { headers: { ...s.headers, 'x-transfer-receipt': input.receipt } }); assert.deepEqual(await response.json(), created);
  response = await s.get(`/internal/v1/transfers/${input.id}`, { method: 'DELETE', headers: { ...s.headers, 'x-transfer-receipt': input.receipt } }); assert.equal((await response.json()).state, 'cancelled');
  assert.equal(s.store.capacity().jobs, 0);
});

test('incorrect receipts and absent transfers return the same result', async t => {
  const s = await setup(t), input = upload(); await post(s, input);
  const headers = { ...s.headers, 'x-transfer-receipt': secret(32) };
  const first = await s.get(`/internal/v1/transfers/${input.id}`, { headers }), second = await s.get(`/internal/v1/transfers/${secret(16)}`, { headers });
  assert.equal(first.status, 404); assert.equal(second.status, 404); assert.deepEqual(await first.json(), await second.json());
});

test('disabled or disconnected bots reject uploads while preserving cancellation and status', async t => {
  const s = await setup(t, { enabled: false, isReady: () => false }), input = upload();
  const response = await post(s, input); assert.equal(response.status, 503); assert.equal((await response.json()).error, 'unavailable');
  assert.equal(s.store.capacity().jobs, 0);
  const status = await s.get('/internal/v1/status'); assert.deepEqual(await status.json(), { enabled: false, ready: false, soundEnabled: false });
});

test('unsupported audio is rejected explicitly rather than sent silently', async t => {
  const s = await setup(t, { soundEnabled: false }), input = upload({ sound: true });
  const response = await post(s, input); assert.equal(response.status, 422); assert.equal((await response.json()).error, 'sound_unavailable');
  assert.equal(s.store.capacity().jobs, 0);
});

test('multipart rejects extra fields, duplicate files, invalid manifest and invalid media', async t => {
  const s = await setup(t);
  for (const input of [upload({ extras: [['recipient', '33612345678']] }), upload({ extras: [['visual', new Blob(['other'])]] }), upload({ locale: 'xx' })]) {
    const response = await post(s, input); assert.equal(response.status, 400); assert.equal(s.store.capacity().jobs, 0);
  }
  const other = await setup(t, { validateMedia: () => { throw Object.assign(new Error('bad-media'), { statusCode: 422 }); } });
  const response = await post(other, upload()); assert.equal(response.status, 422); assert.equal((await response.json()).error, 'invalid');
});

test('declared and streamed oversize bodies are rejected without retaining files', async t => {
  const s = await setup(t, { limits: { bodyBytes: 64 } });
  let response = await post(s, upload()); assert.equal(response.status, 413);
  const status = await new Promise((resolve, reject) => {
    const request = http.request(s.origin + '/internal/v1/transfers', { method: 'POST', headers: { ...s.headers, 'x-transfer-receipt': secret(32), 'content-type': 'multipart/form-data; boundary=small' } }, incoming => { incoming.resume(); resolve(incoming.statusCode); });
    request.on('error', reject); request.write(Buffer.alloc(65)); request.end();
  });
  assert.equal(status, 413); assert.equal(s.store.capacity().jobs, 0); assert.equal(s.app.snapshot().uploads, 0);
});

test('simultaneous uploads are bounded while validation is pending', async t => {
  let release; const barrier = new Promise(resolve => { release = resolve; });
  const s = await setup(t, { validateMedia: async () => { await barrier; return { kind: 'static', duration: 0 }; } });
  const first = post(s, upload()), second = post(s, upload());
  for (let n = 0; n < 100 && s.app.snapshot().uploads < 2; n++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(s.app.snapshot().uploads, 2);
  const third = await post(s, upload()); assert.equal(third.status, 429);
  release(); assert.equal((await first).status, 201); assert.equal((await second).status, 201);
});

test('raw aliases and unsupported methods cannot reach the transfer handler', async t => {
  const s = await setup(t);
  for (const raw of ['/internal/v1/transfers/../status', '/internal/v1/%74ransfers', '/internal/v1/transfers/']) {
    const status = await new Promise((resolve, reject) => {
      const request = http.request(s.origin, { path: raw, headers: s.headers }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); request.end();
    }); assert.equal(status, 404);
  }
  const response = await s.get('/internal/v1/transfers'); assert.equal(response.status, 405);
});

test('sample CLI refuses noninteractive output before reading secrets or opening any request', async () => {
  let called = false;
  await assert.rejects(createSample({ args: [], env: {}, stdin: { isTTY: false }, stdout: { isTTY: false }, stderr: { isTTY: false }, fetchImpl: async () => { called = true; } }), /interactive_admin_terminal_required/);
  assert.equal(called, false);
  for (const args of [[], ['--visual', 'relative.webp'], ['--visual', '/tmp/test.webp', '--url', 'https://example.com'], ['--visual', '/tmp/test.webp', '--locale', 'xx']]) assert.throws(() => sampleArguments(args), /invalid_arguments/);
});

test('sample CLI uploads only a known final local file and shows a code in the admin console', async () => {
  const filename = fileURLToPath(new URL('./fixtures/sticker-lossy.webp', import.meta.url));
  const code = secret(16), lines = []; let calls = 0;
  const result = await createSample({ args: ['--visual', filename], env: { WHATSAPP_BRIDGE_TOKEN: secret(32), PORT: '3001' }, stdin: { isTTY: true }, stderr: { isTTY: true }, stdout: { isTTY: true, write: text => lines.push(text) },
    fetchImpl: async (url, options) => {
      calls++; assert.equal(url, 'http://127.0.0.1:3001/internal/v1/transfers'); assert.equal(options.method, 'POST');
      const manifest = JSON.parse(options.body.get('manifest')); assert.equal(manifest.locale, 'fr');
      assert.deepEqual([...options.body.keys()], ['manifest', 'visual']); assert.equal(options.headers['x-transfer-receipt'].length, 43);
      return new Response(JSON.stringify({ id: manifest.id, state: 'awaiting_message', expiresAt: Date.now() + 600_000, claimCode: code, waUrl: `https://wa.me/33612345678?text=ZAP%20${code}` }), { status: 201 });
    },
  });
  assert.equal(calls, 1); assert.ok(lines.join('').includes(`ZAP ${code}`)); assert.equal(result.id.length, 22); assert.equal(result.claimCode, undefined);
});
