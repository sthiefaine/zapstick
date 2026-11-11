import type { Collection, CollectionFolder } from './types';

export const MAX_FOLDERS = 200;
export const MAX_FOLDER_NAME_LENGTH = 80;
export const DEFAULT_FOLDER_COLOR = '#cdebbb';
const validId = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
const validColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
function folderName(value: string): string {
 if (typeof value !== 'string' || !value.trim()) throw new Error('Donne un nom à cette collection.');
 const name = value.trim();
 if (name.length > MAX_FOLDER_NAME_LENGTH) throw new Error('Le nom de la collection est limité à 80 caractères.');
 return name;
}
function folderColor(value: string): string {
 if (!validColor(value)) throw new Error('Couleur de collection invalide.');
 return value;
}
/** Repair persisted folder metadata without removing media or changing pack assignments. */
export function normalizeFolders(collection: Collection): Collection {
 const input = collection.folders;
 const seen = new Set<string>();
 const folders: CollectionFolder[] = [];
 if (Array.isArray(input)) for (const folder of input) {
  if (folders.length >= MAX_FOLDERS) break;
  if (!folder || !validId(folder.id) || seen.has(folder.id) || typeof folder.name !== 'string' || !folder.name.trim()) continue;
  const name = folder.name.trim().slice(0, MAX_FOLDER_NAME_LENGTH), color = validColor(folder.color) ? folder.color : DEFAULT_FOLDER_COLOR;
  seen.add(folder.id); folders.push(name === folder.name && color === folder.color ? folder : { id: folder.id, name, color });
 }
 let changed = input !== undefined && (!Array.isArray(input) || folders.length !== input.length || folders.some((folder, index) => folder !== input[index]));
 const stickers = collection.stickers.map(sticker => {
  if (sticker.folderId === undefined || sticker.folderId === '' || (typeof sticker.folderId === 'string' && seen.has(sticker.folderId))) return sticker;
  changed = true; return { ...sticker, folderId: '' };
 });
 if (!changed) return collection;
 return { ...collection, ...(input !== undefined ? { folders } : {}), stickers };
}
export function createFolder(collection: Collection, input: { name: string; color?: string; id?: string }): Collection {
 const value = normalizeFolders(collection), folders = value.folders ?? [];
 if (folders.length >= MAX_FOLDERS) throw new Error('Limite de 200 collections atteinte.');
 const id = input.id ?? crypto.randomUUID();
 if (!validId(id) || folders.some(folder => folder.id === id)) throw new Error('Identifiant de collection invalide.');
 const folder = { id, name: folderName(input.name), color: folderColor(input.color ?? DEFAULT_FOLDER_COLOR) };
 return { ...value, folders: [...folders, folder] };
}
export function updateFolder(collection: Collection, id: string, patch: { name?: string; color?: string }): Collection {
 const value = normalizeFolders(collection), index = value.folders?.findIndex(folder => folder.id === id) ?? -1;
 if (index < 0) return value;
 const previous = value.folders![index], next = { ...previous, ...(patch.name !== undefined ? { name: folderName(patch.name) } : {}), ...(patch.color !== undefined ? { color: folderColor(patch.color) } : {}) };
 if (next.name === previous.name && next.color === previous.color) return value;
 return { ...value, folders: value.folders!.map((folder, position) => position === index ? next : folder) };
}
export function deleteFolder(collection: Collection, id: string): Collection {
 const value = normalizeFolders(collection);
 if (!value.folders?.some(folder => folder.id === id)) return value;
 return { ...value, folders: value.folders.filter(folder => folder.id !== id), stickers: value.stickers.map(sticker => sticker.folderId === id ? { ...sticker, folderId: '' } : sticker) };
}
export function moveToFolder(collection: Collection, ids: readonly string[], folderId = ''): Collection {
 const value = normalizeFolders(collection);
 if (folderId && !value.folders?.some(folder => folder.id === folderId)) return value;
 const selected = new Set(ids); let changed = false;
 const stickers = value.stickers.map(sticker => {
  if (!selected.has(sticker.id) || (sticker.folderId ?? '') === folderId) return sticker;
  changed = true; return { ...sticker, folderId };
 });
 return changed ? { ...value, stickers } : value;
}
/** Move the group before beforeId (null means end), preserving all hidden array slots. */
export function reorderStickers(collection: Collection, ids: readonly string[], beforeId: string | null = null, visibleIds?: readonly string[]): Collection {
 const allowed = visibleIds ? new Set(visibleIds) : undefined, selected = new Set(ids);
 const visible = collection.stickers.filter(sticker => !allowed || allowed.has(sticker.id));
 const moved = visible.filter(sticker => selected.has(sticker.id));
 if (!moved.length || (beforeId && (!visible.some(sticker => sticker.id === beforeId) || selected.has(beforeId)))) return collection;
 const remaining = visible.filter(sticker => !selected.has(sticker.id)), index = beforeId ? remaining.findIndex(sticker => sticker.id === beforeId) : remaining.length;
 remaining.splice(index, 0, ...moved);
 let cursor = 0;
 const stickers = collection.stickers.map(sticker => !allowed || allowed.has(sticker.id) ? remaining[cursor++] : sticker);
 return stickers.some((sticker, position) => sticker !== collection.stickers[position]) ? { ...collection, stickers } : collection;
}
/** Move one folder before toId; null appends it. */
export function reorderFolders(collection: Collection, fromId: string, toId: string | null): Collection {
 const folders = collection.folders;
 if (!folders || fromId === toId) return collection;
 const moving = folders.find(folder => folder.id === fromId);
 if (!moving || (toId && !folders.some(folder => folder.id === toId))) return collection;
 const remaining = folders.filter(folder => folder.id !== fromId), index = toId ? remaining.findIndex(folder => folder.id === toId) : remaining.length;
 remaining.splice(index, 0, moving);
 return remaining.some((folder, position) => folder !== folders[position]) ? { ...collection, folders: remaining } : collection;
}
