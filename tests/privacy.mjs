import test, {beforeEach, afterEach, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {indexedDB, IDBObjectStore} from 'fake-indexeddb';
import ts from 'typescript';

// Run the production store against IndexedDB's asynchronous transaction model.
// Only browser storage globals are replaced; the erasure implementation is real.
const originals = new Map(['indexedDB', 'localStorage', 'document','caches'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const preferences = new Map();
const cookies = new Map();
const cacheNames = new Set();
Object.defineProperty(globalThis,'caches',{configurable:true,value:{delete:async name=>cacheNames.delete(name)}});
Object.defineProperty(globalThis, 'indexedDB', {configurable: true, value: indexedDB});
Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: {
  getItem: key => preferences.get(key) ?? null,
  setItem: (key, value) => preferences.set(key, String(value)),
  removeItem: key => preferences.delete(key),
}});
Object.defineProperty(globalThis, 'document', {configurable: true, value: {
  set cookie(value) {
    const [nameValue] = value.split(';');
    const separator = nameValue.indexOf('=');
    const name = nameValue.slice(0, separator);
    if (/Max-Age=0(?:;|$)/i.test(value)) cookies.delete(name);
    else cookies.set(name, nameValue.slice(separator + 1));
  },
}});

function compile(source) {
  return ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
}
function moduleURL(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const typesURL = moduleURL(compile(await readFile(new URL('../lib/stickers/types.ts', import.meta.url), 'utf8')));
const backgroundCoreURL=moduleURL(compile(await readFile(new URL('../lib/stickers/background-removal-core.ts',import.meta.url),'utf8')));
const backgroundURL=moduleURL(compile(await readFile(new URL('../lib/stickers/background-removal.ts',import.meta.url),'utf8')).replaceAll("'./background-removal-core'",`'${backgroundCoreURL}'`));
const storeSource = compile(await readFile(new URL('../lib/stickers/store.ts', import.meta.url), 'utf8'))
  .replace("from './types'", `from '${typesURL}'`).replace("import('./background-removal')",`import('${backgroundURL}')`);
const {saveCollection, loadCollection, clearLocalData} = await import(moduleURL(storeSource));

function collection(id = 'private-upload') {
  return {
    version: 1,
    packs: [{id: 'personal-pack', name: 'Personal pack', kind: 'static', color: '#e4e4e7'}],
    stickers: [{
      id, name: 'Personal media', packId: 'personal-pack', kind: 'static', mime: 'image/png',
      blob: new Blob(['private-image-bytes'], {type: 'image/png'}), favorite: true,
      createdAt: 1, isSticker: false,
    }],
  };
}

async function workspaceRecordCount() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('zapstick-v1', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('workspace').objectStore('workspace').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  await clearLocalData();
  preferences.clear();
  cookies.clear();
  cacheNames.clear();
});
afterEach(async () => { await clearLocalData(); });
after(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test('erasure removes stored media Blobs and app preferences while preserving unrelated keys', async () => {
  await saveCollection(collection());
  const before = await loadCollection();
  assert.equal(await before.stickers[0].blob.text(), 'private-image-bytes');
  assert.equal(before.packs[0].id, 'personal-pack');
  assert.equal(await workspaceRecordCount(), 1);
  preferences.set('zapstick-preferences-v1', '{"theme":"dark","locale":"fr"}');
  preferences.set('unrelated-preference', 'keep');
  cookies.set('zapstick-locale', 'fr');
  cookies.set('zapstick-theme', 'dark');
  cookies.set('unrelated-session', 'keep');
  cacheNames.add('zapstick-background-model-v1');
  cacheNames.add('unrelated-cache');

  await clearLocalData();
  assert.equal(cacheNames.has('zapstick-background-model-v1'),false,'erasure also removes the downloaded model');
  assert.equal(cacheNames.has('unrelated-cache'),true,'unrelated browser caches are preserved');

  assert.equal(await workspaceRecordCount(), 0, 'erasure must clear IndexedDB, not just hide collection items');
  assert.deepEqual(await loadCollection(), {version: 1, packs: [], stickers: []});
  assert.equal(preferences.has('zapstick-preferences-v1'), false);
  assert.equal(preferences.get('unrelated-preference'), 'keep');
  assert.equal(cookies.has('zapstick-locale'), false);
  assert.equal(cookies.has('zapstick-theme'), false);
  assert.equal(cookies.get('unrelated-session'), 'keep');
});

test('queued saves cannot restore erased data and an in-flight transaction is erased afterwards', {timeout: 5000}, async () => {
  const first = saveCollection(collection('queued-first'));
  const second = saveCollection(collection('queued-second'));
  await Promise.all([first, second, clearLocalData()]);
  assert.equal(await workspaceRecordCount(), 0);

  // Observe the IndexedDB write boundary so erasure starts after put(), but
  // before the transaction's asynchronous completion event.
  let observePut;
  const putStarted = new Promise(resolve => { observePut = resolve; });
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = originalPut.apply(this, args);
    observePut();
    return request;
  };
  try {
    const inFlight = saveCollection(collection('in-flight'));
    await putStarted;
    await Promise.all([inFlight, clearLocalData()]);
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  assert.equal(await workspaceRecordCount(), 0);
  assert.deepEqual((await loadCollection()).stickers, []);
});

test('fresh data can be saved after a reset without reviving the previous collection', async () => {
  await saveCollection(collection('old-upload'));
  const erasure = clearLocalData();
  const freshWrite = saveCollection(collection('new-upload'));
  await Promise.all([erasure, freshWrite]);

  const restored = await loadCollection();
  assert.deepEqual(restored.stickers.map(item => item.id), ['new-upload']);
  assert.equal(await restored.stickers[0].blob.text(), 'private-image-bytes');
  assert.equal(restored.stickers[0].favorite, true);
  assert.equal(await workspaceRecordCount(), 1);
});
