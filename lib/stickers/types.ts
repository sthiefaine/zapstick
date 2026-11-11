export type Pack = { id: string; name: string; color: string; kind: 'static' | 'animated' };
export type Sticker = { id: string; name: string; packId: string; kind: 'static' | 'animated'; mime: string; src?: string; blob?: Blob; favorite: boolean; createdAt: number; isSticker: boolean; sourceUrl?: string };
export type Collection = { stickers: Sticker[]; packs: Pack[]; version: 1 };
export const colors = ['#e3ede4', '#f7e6cf', '#e8e3f5', '#f7dfe3', '#dcecf1', '#f5edc9'];
export const initialPacks: Pack[] = [
  { id: 'reactions', name: 'Les réactions', color: colors[0], kind: 'static' },
  { id: 'animals', name: 'Petites bêtes', color: colors[1], kind: 'static' },
  { id: 'daily', name: 'Au quotidien', color: colors[2], kind: 'static' },
];
const names = ['Chat alors !', 'Tout va bien', 'Un peu la flemme', 'Love you', 'On se capte', 'Café, d’abord', 'Pas convaincu', 'Let’s go !', 'Chaud devant', 'Petite pause', 'Ça régale', 'Bien joué', 'Coucou toi', 'Mood du jour', 'Merciii', 'À tout à l’heure'];
export function initialCollection(): Collection {
  return { version: 1, packs: initialPacks.map(p=>({...p})), stickers: names.map((name,i)=>({id: `starter-${i}`, name, packId: ['animals','reactions','animals','reactions','daily','daily','animals','reactions','reactions','daily','daily','reactions','animals','reactions','reactions','animals'][i], kind: 'static', mime: 'image/svg+xml', src: `/stickers/${i}.svg`, favorite: [0,3,7].includes(i), createdAt: 1700000000000-i*1000, isSticker: false})) };
}
