import { Collection, initialCollection, removeExamples } from './types';
const KEY = 'collection';
let connection: Promise<IDBDatabase> | undefined;
let operations: Promise<void> = Promise.resolve();
let writeGeneration = 0;

// Serializing operations makes erasure ordered with reads and pending writes.
// A reset invalidates queued save calls before they can put stale Blob records back.
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const result = operations.then(operation);
  operations = result.then(() => undefined, () => undefined);
  return result;
}
function database(): Promise<IDBDatabase> {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('zapstick-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('workspace');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
    request.onerror = () => {
      connection = undefined;
      reject(new Error('Le stockage de ce navigateur est indisponible.'));
    };
  });
}
export function loadCollection(): Promise<Collection> {
  return ordered(async () => {
    const db = await database();
    return new Promise<Collection>((resolve, reject) => {
      const request = db.transaction('workspace').objectStore('workspace').get(KEY);
      request.onsuccess = () => resolve(removeExamples(request.result ?? initialCollection()));
      request.onerror = () => reject(new Error('Impossible de lire la collection locale.'));
    });
  });
}
export function saveCollection(value: Collection): Promise<void> {
  const generation = writeGeneration;
  return ordered(async () => {
    if (generation !== writeGeneration) return;
    const db = await database();
    if (generation !== writeGeneration) return;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Espace de stockage insuffisant. Télécharge une sauvegarde.'));
      tx.onabort = () => reject(new Error('Sauvegarde interrompue.'));
    });
  });
}
/** Erase all local media records and Zapstick preferences, without deleting downloaded files. */
export function clearLocalData(): Promise<void> {
  writeGeneration++;
  return ordered(async () => {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      // Clearing the store erases all Blob data. Unlike deleteDatabase(), it
      // cannot remain blocked by another open tab holding an older connection.
      tx.objectStore('workspace').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Impossible d’effacer les données locales. Réessaie.'));
      tx.onabort = () => reject(new Error('L’effacement a été interrompu. Réessaie.'));
    });
    db.close();
    connection = undefined;
    // Stop inference before removing its non-personal model cache. A browser
    // refusing CacheStorage must not prevent erasure of the user's collection.
    try { const {clearBackgroundModelCache}=await import('./background-removal'); await clearBackgroundModelCache(); } catch { /* The collection and preferences can still be erased. */ }
    try { localStorage.removeItem('zapstick-preferences-v1'); } catch { /* Preferences may already be blocked by the browser. */ }
    if (typeof document !== 'undefined') {
      for (const key of ['zapstick-locale', 'zapstick-theme']) {
        document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`;
      }
    }
  });
}
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function backup(collection:Collection) {
  const stickers=await Promise.all(collection.stickers.map(async s=>{if(!s.blob)return s;const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=()=>reject(r.error);r.readAsDataURL(s.blob!);});return {...s,blob:undefined,data};}));
  download(new Blob([JSON.stringify({...collection,stickers})],{type:'application/json'}),`zapstick-sauvegarde-${new Date().toISOString().slice(0,10)}.json`);
}
export async function restore(file:File):Promise<Collection>{
  if(file.size>100*1024*1024)throw new Error('La sauvegarde dépasse 100 Mo.');
  const data=JSON.parse(await file.text());
  if(data.version!==1||!Array.isArray(data.stickers)||!Array.isArray(data.packs)||data.stickers.length>2000||data.packs.length>200)throw new Error('Ce fichier n’est pas une sauvegarde Zapstick valide.');
  const ids=new Set<string>();
  for(const p of data.packs){if(typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||p.name.length>80||!['static','animated'].includes(p.kind)||!/^#[0-9a-f]{6}$/i.test(p.color))throw new Error('Pack invalide dans la sauvegarde.');ids.add(p.id);}
  const stickerIds=new Set<string>();
  const stickers=await Promise.all(data.stickers.map(async(s:any)=>{if(typeof s.id!=='string'||stickerIds.has(s.id)||typeof s.name!=='string'||s.name.length>120||!['static','animated'].includes(s.kind)||typeof s.mime!=='string'||!s.mime.match(/^(image\/(png|jpeg|webp|gif|svg\+xml)|video\/(mp4|webm|quicktime))$/)||typeof s.favorite!=='boolean'||typeof s.createdAt!=='number'||typeof s.isSticker!=='boolean'||(s.packId&&!ids.has(s.packId)))throw new Error('Sticker invalide dans la sauvegarde.');
    stickerIds.add(s.id);let blob:Blob|undefined;let src:string|undefined;
    if(s.data){if(typeof s.data!=='string'||!s.data.startsWith(`data:${s.mime};base64,`))throw new Error('Média invalide.');blob=await(await fetch(s.data)).blob();if(blob.size>20*1024*1024)throw new Error('Un média dépasse 20 Mo.');}else if(typeof s.src==='string'&&/^\/stickers\/\d{1,2}\.svg$/.test(s.src)){src=s.src;}else throw new Error('Média manquant dans la sauvegarde.');
    return {id:s.id,name:s.name,packId:s.packId,kind:s.kind,mime:s.mime,favorite:s.favorite,createdAt:s.createdAt,isSticker:s.isSticker,sourceUrl:typeof s.sourceUrl==='string'&&s.sourceUrl.startsWith('https://')?s.sourceUrl:undefined,blob,src};
  }));return removeExamples({version:1,packs:data.packs,stickers});
}
