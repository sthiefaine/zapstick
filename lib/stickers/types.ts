export type Pack = { id: string; name: string; color: string; kind: 'static' | 'animated' };
export type CollectionFolder = { id: string; name: string; color: string };
export type Sticker = { id: string; name: string; packId: string; folderId?: string; kind: 'static' | 'animated'; mime: string; src?: string; blob?: Blob; favorite: boolean; createdAt: number; isSticker: boolean; sourceUrl?: string };
export type Collection = { stickers: Sticker[]; packs: Pack[]; folders?: CollectionFolder[]; version: 1 };
export const colors = ['#e4e4e7', '#ddd7ce', '#d2ddd7', '#d1d8e0', '#ddd7e2', '#e0d7d7'];
export function initialCollection(): Collection {
  return { version: 1, packs: [], stickers: [] };
}

// Remove only the built-in collection from the first release. Keep user media
// and custom/renamed packs, including imports placed in a default pack.
export function removeExamples(collection: Collection): Collection {
  const examples: Record<string, string> = {
    reactions: 'Les réactions', animals: 'Petites bêtes', daily: 'Au quotidien',
  };
  const removedPacks = new Set(collection.packs.filter(p => examples[p.id] === p.name).map(p => p.id));
  return {
    ...collection,
    packs: collection.packs.filter(p => !removedPacks.has(p.id)),
    stickers: collection.stickers
      .filter(s => !(/^starter-\d+$/.test(s.id) && /^\/stickers\/\d+\.svg$/.test(s.src ?? '') && !s.blob))
      .map(s => removedPacks.has(s.packId) ? {...s, packId: ''} : s),
  };
}
