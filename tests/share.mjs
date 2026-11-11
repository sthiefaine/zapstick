import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

async function moduleFromTS(path) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const {zapstickShareUrl, shareZapstick} = await moduleFromTS('../lib/stickers/share.ts');
const payload = {title: 'Zapstick', text: 'Crée tes stickers WhatsApp avec Zapstick ✨', url: 'https://stickers.example.com/pt-BR'};

test('sharing uses the configured public HTTPS origin and the current locale without page state', () => {
  assert.equal(zapstickShareUrl({locale: 'pt-BR', origin: 'http://localhost:3115', configuredUrl: 'https://stickers.example.com/old?token=private#section'}), payload.url);
  assert.equal(zapstickShareUrl({locale: 'ja', origin: 'https://preview.example.com/ja/privacy?link=private'}), 'https://preview.example.com/ja');
  assert.equal(zapstickShareUrl({locale: 'fr', origin: 'http://localhost:3115'}), 'http://localhost:3115/fr');
});

test('invalid, insecure and private configured domains fall back to the actual current origin', () => {
  for (const configuredUrl of ['invalid', 'http://stickers.example.com', 'https://user:secret@stickers.example.com', 'https://localhost:3000', 'https://127.0.0.1', 'https://[::1]', 'https://app.local', 'https://app.internal', 'https://zapstick.example']) {
    assert.equal(zapstickShareUrl({locale: 'de', origin: 'https://preview.example.com:444', configuredUrl}), 'https://preview.example.com:444/de');
  }
});

test('native sharing receives the exact invitation and URL, without copying or network access', async () => {
  const originalFetch = globalThis.fetch;let requests = 0, copies = 0, shares = 0;
  globalThis.fetch = async () => {requests++;throw Error('Unexpected network request');};
  try {
    const result = await shareZapstick(payload, {share: async value => {shares++;assert.deepEqual(value, payload);}, writeText: async () => {copies++;}});
    assert.deepEqual(result, {status: 'shared', url: payload.url});
    assert.equal(shares, 1);assert.equal(copies, 0);assert.equal(requests, 0);
  } finally {globalThis.fetch = originalFetch;}
});

test('cancelling the native share sheet stays silent and does not touch the clipboard', async () => {
  let copies = 0;
  const result = await shareZapstick(payload, {share: async () => {throw {name: 'AbortError'};}, writeText: async () => {copies++;}});
  assert.equal(result.status, 'cancelled');assert.equal(copies, 0);
});

test('unavailable or rejected native sharing copies only the share URL; clipboard refusal returns a manual link', async () => {
  const copied = [];
  assert.equal((await shareZapstick(payload, {writeText: async value => {copied.push(value);}})).status, 'copied');
  assert.equal((await shareZapstick(payload, {share: async () => {throw {name: 'NotAllowedError'};}, writeText: async value => {copied.push(value);}})).status, 'copied');
  assert.deepEqual(copied, [payload.url, payload.url]);
  assert.deepEqual(await shareZapstick(payload, {writeText: async () => {throw {name: 'NotAllowedError'};}}), {status: 'manual', url: payload.url});
  assert.deepEqual(await shareZapstick(payload, {}), {status: 'manual', url: payload.url});
});

test('sharing labels and invitation are translated in all eight languages', async () => {
  const {shareSources, shareTranslations} = await moduleFromTS('../lib/i18n/share-translations.ts');
  for (const locale of ['fr', 'en', 'pt-BR', 'es', 'de', 'zh-CN', 'ja', 'ru']) {
    assert.equal(Object.keys(shareTranslations[locale]).length, shareSources.length);
    for (const source of shareSources) assert.ok(shareTranslations[locale][source]);
  }
});
