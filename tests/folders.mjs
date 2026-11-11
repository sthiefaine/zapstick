import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { IDBFactory } from 'fake-indexeddb';
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
const { createFolder, updateFolder, deleteFolder, moveToFolder, reorderStickers, reorderFolders, normalizeFolders } = loadTS('lib/stickers/folders.ts');
const { initialCollection } = loadTS('lib/stickers/types.ts');
const { saveCollection, loadCollection, createBackup, restore } = loadTS('lib/stickers/store.ts');
const originals = new Map(['indexedDB', 'FileReader'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: new IDBFactory() });
// FileReader is the browser adapter; production serialization, Blob bytes and restore are exercised unchanged.
class BlobReader {
 result = null; error = null; onload = null; onerror = null;
 readAsDataURL(blob) { blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onload?.(); }, error => { this.error = error; this.onerror?.(); }); }
}
Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: BlobReader });
after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
beforeEach(async () => { await saveCollection(initialCollection()); });
const ids = value => value.stickers.map(sticker => sticker.id);
function collection() {
 const packs = [{ id: 'pack-static', name: 'Static', color: '#e4e4e7', kind: 'static' }, { id: 'pack-animated', name: 'Animated', color: '#ddd7ce', kind: 'animated' }];
 const folders = [{ id: 'family', name: 'Family', color: '#cdebbb' }, { id: 'work', name: 'Work', color: '#f6c1a3' }, { id: 'memes', name: 'Memes', color: '#e4e4e7' }];
 const stickers = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => ({ id, name: id, packId: index === 2 ? 'pack-animated' : 'pack-static', ...(index < 3 ? { folderId: 'family' } : {}), kind: index === 2 ? 'animated' : 'static', mime: index === 2 ? 'image/gif' : 'image/png', blob: new Blob([`media-${id}`], { type: index === 2 ? 'image/gif' : 'image/png' }), favorite: index % 2 === 0, createdAt: 100 - index * 10, isSticker: false }));
 return { version: 1, folders, packs, stickers };
}
test('folder creation, metadata edits and limits preserve the original collection', () => {
 const original = initialCollection(), created = createFolder(original, { id: 'folder-1', name: '  My collection  ', color: '#aAbBcC' });
 assert.deepEqual(original, { version: 1, packs: [], stickers: [] });
 assert.deepEqual(created.folders, [{ id: 'folder-1', name: 'My collection', color: '#aAbBcC' }]);
 const edited = updateFolder(created, 'folder-1', { name: 'Renamed', color: '#000000' });
 assert.equal(edited.folders[0].name, 'Renamed'); assert.equal(created.folders[0].name, 'My collection');
 assert.equal(updateFolder(created, 'missing', { name: '' }), created);
 assert.throws(() => createFolder(created, { id: 'folder-1', name: 'Duplicate' }), /Identifiant/);
 assert.throws(() => createFolder(created, { name: ' ' }), /Donne un nom/);
 assert.throws(() => updateFolder(created, 'folder-1', { name: 'a'.repeat(81) }), /80 caractères/);
 assert.throws(() => createFolder(created, { name: 'Color', color: 'red' }), /Couleur/);
 const full = { ...original, folders: Array.from({ length: 200 }, (_, index) => ({ id: `f-${index}`, name: `Folder ${index}`, color: '#123456' })) };
 assert.throws(() => createFolder(full, { name: 'One more' }), /200 collections/);
});
test('bulk folder moves and deletion keep media, Blob references, order and packs intact', () => {
 const original = collection(), moved = moveToFolder(original, ['a', 'c', 'e', 'missing'], 'work');
 assert.deepEqual(moved.stickers.filter(sticker => sticker.folderId === 'work').map(sticker => sticker.id), ['a', 'c', 'e']);
 assert.equal(moved.packs, original.packs); assert.deepEqual(ids(moved), ids(original));
 for (let index = 0; index < original.stickers.length; index++) { assert.equal(moved.stickers[index].blob, original.stickers[index].blob); assert.equal(moved.stickers[index].packId, original.stickers[index].packId); }
 assert.equal(moveToFolder(original, ['a'], 'missing'), original);
 const removed = deleteFolder(moved, 'work');
 assert.equal(removed.stickers.length, original.stickers.length); assert.equal(removed.folders.length, 2);
 assert.deepEqual(removed.stickers.filter(sticker => sticker.folderId === '').map(sticker => sticker.id), ['a', 'c', 'e']);
 assert.equal(removed.stickers[0].packId, 'pack-static'); assert.equal(removed.stickers[2].packId, 'pack-animated');
 assert.equal(removed.stickers[0].blob, original.stickers[0].blob); assert.equal(original.stickers[0].folderId, 'family');
});
test('multi-item reorder uses current array order and preserves hidden slots under filters', () => {
 const original = collection(), filtered = reorderStickers(original, ['e', 'c'], 'a', ['a', 'c', 'e']);
 assert.deepEqual(ids(filtered), ['c', 'b', 'e', 'd', 'a', 'f']);
 for (const index of [1, 3, 5]) assert.equal(filtered.stickers[index], original.stickers[index]);
 assert.deepEqual(ids(reorderStickers(original, ['c', 'a'], null, ['a', 'c', 'e'])), ['e', 'b', 'a', 'd', 'c', 'f']);
 assert.deepEqual(ids(reorderStickers(original, ['d', 'b'], 'a')), ['b', 'd', 'a', 'c', 'e', 'f']);
 assert.equal(reorderStickers(original, ['a'], 'missing'), original);
 assert.equal(reorderStickers(original, ['a', 'c'], 'c'), original);
 assert.equal(reorderStickers(original, ['b'], 'a', ['a', 'c', 'e']), original);
 assert.deepEqual(ids(original), ['a', 'b', 'c', 'd', 'e', 'f']);
});
test('folder reorder inserts before the target and accepts appending without changing media', () => {
 const original = collection(), reordered = reorderFolders(original, 'family', 'memes');
 assert.deepEqual(reordered.folders.map(folder => folder.id), ['work', 'family', 'memes']);
 assert.deepEqual(reorderFolders(original, 'family', null).folders.map(folder => folder.id), ['work', 'memes', 'family']);
 assert.equal(reordered.stickers, original.stickers); assert.equal(reordered.packs, original.packs);
 assert.equal(reorderFolders(original, 'missing', 'work'), original); assert.equal(reorderFolders(original, 'family', 'family'), original);
});
test('migration repairs orphan folder references while preserving legacy version-1 shape', () => {
 const legacy = { ...collection() }; delete legacy.folders; legacy.stickers = legacy.stickers.map(({ folderId, ...sticker }) => sticker);
 assert.equal(normalizeFolders(legacy), legacy); assert.equal(Object.hasOwn(normalizeFolders(legacy), 'folders'), false);
 const malformed = { ...collection(), folders: [{ id: 'family', name: ' Family ', color: 'bad' }, { id: 'family', name: 'Duplicate', color: '#ffffff' }, { id: '', name: 'Invalid', color: '#ffffff' }], stickers: collection().stickers.map((sticker, index) => index === 3 ? { ...sticker, folderId: 'deleted' } : sticker) };
 const repaired = normalizeFolders(malformed);
 assert.equal(repaired.folders.length, 1); assert.equal(repaired.folders[0].name, 'Family'); assert.equal(repaired.folders[0].color, '#cdebbb');
 assert.equal(repaired.stickers[3].folderId, ''); assert.equal(repaired.stickers[0].folderId, 'family'); assert.equal(repaired.stickers[3].blob, malformed.stickers[3].blob);
 assert.equal(normalizeFolders(repaired), repaired);
});
test('real IndexedDB save/load and downloaded backup restoration retain manual order and folder associations', async () => {
 const original = moveToFolder(reorderStickers(reorderFolders(collection(), 'memes', 'family'), ['e', 'a'], null), ['c', 'f'], 'work');
 await saveCollection(original);
 const loaded = await loadCollection();
 assert.deepEqual(ids(loaded), ids(original)); assert.deepEqual(loaded.folders, original.folders); assert.deepEqual(loaded.packs, original.packs);
 assert.equal(loaded.stickers.find(sticker => sticker.id === 'c').folderId, 'work');
 for (const sticker of loaded.stickers) assert.equal(await sticker.blob.text(), `media-${sticker.id}`);
 const file = new File([await createBackup(loaded)], 'backup.json', { type: 'application/json' }), restored = await restore(file);
 assert.deepEqual(ids(restored), ids(original)); assert.deepEqual(restored.folders, original.folders); assert.deepEqual(restored.packs, original.packs);
 for (const sticker of restored.stickers) { const source = original.stickers.find(item => item.id === sticker.id); assert.equal(sticker.folderId, source.folderId); assert.equal(sticker.packId, source.packId); assert.equal(sticker.createdAt, source.createdAt); assert.equal(await sticker.blob.text(), `media-${sticker.id}`); }
});
test('old backups without folders remain readable and malformed folder data cannot create orphan links', async () => {
 const legacy = collection(); delete legacy.folders; legacy.stickers = legacy.stickers.map(({ folderId, ...sticker }) => sticker);
 const oldFile = new File([await createBackup(legacy)], 'old.json'), restored = await restore(oldFile);
 assert.equal(Object.hasOwn(restored, 'folders'), false); assert.deepEqual(ids(restored), ids(legacy)); assert.equal(await restored.stickers[0].blob.text(), 'media-a');
 const data = JSON.parse(await (await createBackup(collection())).text()); data.stickers[0].folderId = 'missing';
 const repaired = await restore(new File([JSON.stringify(data)], 'orphan.json')); assert.equal(repaired.stickers[0].folderId, ''); assert.equal(repaired.stickers[0].packId, data.stickers[0].packId);
 data.folders.push(data.folders[0]); await assert.rejects(restore(new File([JSON.stringify(data)], 'duplicate.json')), /Collection de rangement invalide/);
 data.folders = Array.from({ length: 201 }, (_, index) => ({ id: String(index), name: 'Folder', color: '#123456' }));
 await assert.rejects(restore(new File([JSON.stringify(data)], 'too-many.json')), /sauvegarde Zapstick valide/);
});
