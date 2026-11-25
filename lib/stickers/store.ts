import { Collection, initialCollection, removeExamples, type Sticker, type StickerSound } from './types';
import { normalizeFolders } from './folders';
const KEY = 'collection';
let connection: Promise<IDBDatabase> | undefined;
let operations: Promise<void> = Promise.resolve();
let writeGeneration = 0;
let starterMemesSuppressed = false;
export const MAX_SAVED_AUDIO_BYTES = Math.ceil(2.4 * 1024 * 1024);
const MAX_SAVED_AUDIO_SECONDS = 6.1;
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

/** Saved sound is normalized PCM16 WAV, never a browser recorder's opaque output. */
export async function validateStickerSound(sound: StickerSound): Promise<void> {
  if (!sound || !(sound.blob instanceof Blob) || sound.blob.type !== 'audio/wav' || typeof sound.name !== 'string' || sound.name.length > 120 || /[\u0000-\u001f\u007f]/.test(sound.name) || !Number.isFinite(sound.duration) || sound.duration <= 0 || sound.duration > MAX_SAVED_AUDIO_SECONDS || (sound.volume !== undefined && (!Number.isFinite(sound.volume) || sound.volume < 0 || sound.volume > 1)) || (sound.offset !== undefined && (!Number.isFinite(sound.offset) || sound.offset < -6 || sound.offset > 6))) throw new Error('Son enregistré invalide.');
  if (sound.blob.size > MAX_SAVED_AUDIO_BYTES) throw new Error('La piste audio dépasse 2,4 Mo.');
  const invalid = () => new Error('La piste audio n’est pas un WAV valide.');
  const bytes = new Uint8Array(await sound.blob.arrayBuffer());
  if (bytes.length < 44) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) !== bytes.length - 8) throw invalid();
  let offset = 12, sampleRate = 0, blockAlign = 0, dataSize = -1;
  while (offset + 8 <= bytes.length) {
    const kind = tag(offset), size = view.getUint32(offset + 4, true), start = offset + 8, end = start + size;
    if (end > bytes.length) throw invalid();
    if (kind === 'fmt ') {
      if (sampleRate || size !== 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw invalid();
      const channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true); blockAlign = view.getUint16(start + 12, true);
      if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 96000 || blockAlign !== channels * 2 || view.getUint32(start + 8, true) !== sampleRate * blockAlign) throw invalid();
    } else if (kind === 'data') {
      if (dataSize !== -1) throw invalid();
      dataSize = size;
    }
    offset = end + (size % 2);
  }
  if (offset !== bytes.length || !sampleRate || dataSize <= 0 || dataSize % blockAlign) throw invalid();
  const duration = dataSize / blockAlign / sampleRate;
  if (duration > MAX_SAVED_AUDIO_SECONDS || Math.abs(duration - sound.duration) > 1 / sampleRate + 1e-9) throw invalid();
}

/** Layers are the editable components of the saved mix, not extra soundtrack slots. */
function soundLayers(sticker: Pick<Sticker, 'sound' | 'soundLayers'>): StickerSound[] | undefined {
  const layers = sticker.soundLayers;
  if (layers === undefined) return undefined;
  if (!Array.isArray(layers) || layers.length < 1 || layers.length > 2 || !sticker.sound) throw new Error('Son enregistré invalide.');
  for (const layer of layers) {
    if (!layer || !(layer.blob instanceof Blob) || !Number.isFinite(layer.duration) || layer.duration <= 0 || layer.duration > 6 || (layer.volume !== undefined && (!Number.isFinite(layer.volume) || layer.volume < 0 || layer.volume > 1)) || (layer.offset !== undefined && (!Number.isFinite(layer.offset) || layer.offset < -6 || layer.offset > 6))) throw new Error('Son enregistré invalide.');
  }
  return layers;
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

async function restoreSound(saved: any): Promise<StickerSound> {
  const prefix='data:audio/wav;base64,';
  if(!saved||saved.mime!=='audio/wav'||typeof saved.data!=='string'||!saved.data.startsWith(prefix)||saved.data.length>prefix.length+4*Math.ceil(MAX_SAVED_AUDIO_BYTES/3))throw new Error('Son enregistré invalide.');
  const encoded=saved.data.slice(prefix.length);
  if(!encoded.length||encoded.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new Error('Son enregistré invalide.');
  const sound={blob:await(await fetch(saved.data)).blob(),duration:saved.duration,name:saved.name,...(saved.volume!==undefined?{volume:saved.volume}:{}),...(saved.offset!==undefined?{offset:saved.offset}:{})};
  await validateStickerSound(sound);
  return sound;
}

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
      request.onsuccess = () => resolve(normalizeFolders(removeExamples(request.result ?? initialCollection())));
      request.onerror = () => reject(new Error('Impossible de lire la collection locale.'));
    });
  });
}
/** The public library receives these six local media once, including upgrades.
 * A marker travels with backups; clearing local data suppresses onboarding. */
export async function loadCollectionWithStarterMemes(localize?:(source:string)=>string):Promise<Collection>{
 const generation=writeGeneration,value=await loadCollection();
 if(value.starterMemesVersion===1)return value;
 const {withStarterMemes}=await import('./starter-memes');
 if(generation!==writeGeneration)return {...initialCollection(),starterMemesVersion:1};
 const updated=withStarterMemes(value,localize,starterMemesSuppressed);
 await saveCollection(updated);
 return generation===writeGeneration?updated:{...initialCollection(),starterMemesVersion:1};
}
export function saveCollection(value: Collection): Promise<void> {
  const generation = writeGeneration;
  return ordered(async () => {
    if (generation !== writeGeneration) return;
    for (const sticker of value.stickers) {
      const layers = soundLayers(sticker);
      if (sticker.sound !== undefined) await validateStickerSound(sticker.sound);
      for (const layer of layers ?? []) await validateStickerSound(layer);
    }
    if (generation !== writeGeneration) return;
    const db = await database();
    if (generation !== writeGeneration) return;
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put(normalizeFolders(value), KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Espace de stockage insuffisant. Télécharge une sauvegarde.'));
      tx.onabort = () => reject(new Error('Sauvegarde interrompue.'));
    });
  });
}
/** Erase all local media records and Zapstick preferences, without deleting downloaded files. */
export function clearLocalData(): Promise<void> {
  writeGeneration++;
  starterMemesSuppressed=true;
  // Start cancellation before waiting for queued storage operations.
  const stoppedAudio = import('./audio').then(({stopAllAudioWork}) => stopAllAudioWork()).catch(() => {});
  return ordered(async () => {
    // Import lazily: opening the library must not initialize audio or request a microphone.
    await stoppedAudio;
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
export async function createBackup(collection:Collection):Promise<Blob> {
  const value=normalizeFolders(collection);
  type BackupSound={name:string;duration:number;mime:'audio/wav';data:string;volume?:number;offset?:number};
  type BackupSticker=Omit<Sticker,'blob'|'sound'|'soundLayers'> & {blob?:undefined;data?:string;sound?:BackupSound;soundLayers?:BackupSound[]};
  const prepared=value.stickers.map(s=>{
    const sourceSound=s.sound,sourceLayers=soundLayers(s);
    if(sourceSound!==undefined&&(!sourceSound||!(sourceSound.blob instanceof Blob)))throw new Error('Son enregistré invalide.');
    const localGif=!s.blob&&s.src?.startsWith('/memes/')?s.src:undefined;
    const emptySound=(sound:StickerSound):BackupSound=>({name:sound.name,duration:sound.duration,mime:'audio/wav',data:'',...(sound.volume!==undefined?{volume:sound.volume}:{}),...(sound.offset!==undefined?{offset:sound.offset}:{})});
    const serialized:BackupSticker={...s,blob:undefined,sound:sourceSound===undefined?undefined:emptySound(sourceSound),soundLayers:sourceLayers?.map(emptySound),...(s.blob||localGif?{src:undefined,data:''}:{})};
    return {serialized,sourceSound,sourceLayers,blob:s.blob,localGif};
  });
  const output={...value,stickers:prepared.map(item=>item.serialized)};
  const tooLarge=()=>new Error('La sauvegarde dépasse 100 Mo.');
  // Empty data strings retain all JSON punctuation, escaped names and UTF-8 metadata.
  // Base64 expands deterministically, so reject oversized collections before any reader allocates it.
  let budget=new Blob([JSON.stringify(output)]).size;
  const checkBudget=()=>{if(budget>MAX_BACKUP_BYTES)throw tooLarge();};
  const reserve=(blob:Blob)=>{
    const prefix=`data:${blob.type||'application/octet-stream'};base64,`;
    budget+=4*Math.ceil(blob.size/3)+new Blob([JSON.stringify(prefix)]).size-2;
    checkBudget();
  };
  checkBudget();
  for(const item of prepared){if(item.blob)reserve(item.blob);if(item.sourceSound)reserve(item.sourceSound.blob);for(const layer of item.sourceLayers??[])reserve(layer.blob);}
  // Resolve bundled GIFs one at a time and charge each serialized occurrence to the same budget.
  const localGifs=new Map<string,Blob>();
  for(const item of prepared){
    if(!item.localGif)continue;
    let blob=localGifs.get(item.localGif);
    if(!blob){
      const {HOME_MEMES}=await import('./home-memes');
      if(!HOME_MEMES.some(meme=>meme.src===item.localGif))throw new Error('Le média est introuvable.');
      const response=await fetch(item.localGif,{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('Impossible de charger ce média.');
      blob=await response.blob();
      if(blob.size>20*1024*1024||blob.type!=='image/gif')throw new Error('Format de média non pris en charge.');
      localGifs.set(item.localGif,blob);
    }
    reserve(blob);item.blob=blob;
  }
  // A single in-flight read avoids thousands of concurrent Blob and base64 copies.
  for(const item of prepared){
    if(item.sourceSound){await validateStickerSound(item.sourceSound);item.serialized.sound!.data=await dataUrl(item.sourceSound.blob);}
    for(const [index,layer] of (item.sourceLayers??[]).entries()){await validateStickerSound(layer);item.serialized.soundLayers![index].data=await dataUrl(layer.blob);}
    if(item.blob)item.serialized.data=await dataUrl(item.blob);
  }
  const result=new Blob([JSON.stringify(output)],{type:'application/json'});
  if(result.size>MAX_BACKUP_BYTES)throw tooLarge();
  return result;
}
export async function backup(collection:Collection) {
  download(await createBackup(collection),`zapstick-sauvegarde-${new Date().toISOString().slice(0,10)}.json`);
}
export async function restore(file:File):Promise<Collection>{
  if(file.size>MAX_BACKUP_BYTES)throw new Error('La sauvegarde dépasse 100 Mo.');
  const data=JSON.parse(await file.text());
  if(!data||data.version!==1||!Array.isArray(data.stickers)||!Array.isArray(data.packs)||data.stickers.length>2000||data.packs.length>200||(data.folders!==undefined&&(!Array.isArray(data.folders)||data.folders.length>200)))throw new Error('Ce fichier n’est pas une sauvegarde Zapstick valide.');
  const folderIds=new Set<string>();
  if(data.folders)for(const folder of data.folders){if(!folder||typeof folder.id!=='string'||!folder.id.trim()||folder.id.length>120||/[\u0000-\u001f\u007f]/.test(folder.id)||folderIds.has(folder.id)||typeof folder.name!=='string'||!folder.name.trim()||folder.name.length>80||!/^#[0-9a-f]{6}$/i.test(folder.color))throw new Error('Collection de rangement invalide dans la sauvegarde.');folderIds.add(folder.id);}
  const ids=new Set<string>();
  for(const p of data.packs){if(typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||p.name.length>80||!['static','animated'].includes(p.kind)||!/^#[0-9a-f]{6}$/i.test(p.color))throw new Error('Pack invalide dans la sauvegarde.');ids.add(p.id);}
  const stickerIds=new Set<string>();
  const stickers:Sticker[]=[];
  for(const s of data.stickers){if(!s||typeof s.id!=='string'||stickerIds.has(s.id)||typeof s.name!=='string'||s.name.length>120||!['static','animated'].includes(s.kind)||typeof s.mime!=='string'||!s.mime.match(/^(image\/(png|jpeg|webp|gif|svg\+xml)|video\/(mp4|webm|quicktime))$/)||typeof s.favorite!=='boolean'||typeof s.createdAt!=='number'||typeof s.isSticker!=='boolean'||(s.packId&&!ids.has(s.packId))||(s.folderId!==undefined&&typeof s.folderId!=='string'))throw new Error('Sticker invalide dans la sauvegarde.');
    if(s.soundLayers!==undefined&&(!Array.isArray(s.soundLayers)||s.soundLayers.length<1||s.soundLayers.length>2||!s.sound))throw new Error('Son enregistré invalide.');
    stickerIds.add(s.id);let blob:Blob|undefined;let src:string|undefined;
    if(s.data){if(typeof s.data!=='string'||!s.data.startsWith(`data:${s.mime};base64,`))throw new Error('Média invalide.');blob=await(await fetch(s.data)).blob();if(blob.size>20*1024*1024)throw new Error('Un média dépasse 20 Mo.');}else if(typeof s.src==='string'&&/^\/stickers\/\d{1,2}\.svg$/.test(s.src)){src=s.src;}else throw new Error('Média manquant dans la sauvegarde.');
    const sound=s.sound===undefined?undefined:await restoreSound(s.sound);
    let restoredLayers:StickerSound[]|undefined;
    if(s.soundLayers!==undefined){
      restoredLayers=[];
      for(const saved of s.soundLayers)restoredLayers.push(await restoreSound(saved));
      soundLayers({sound,soundLayers:restoredLayers});
    }
    stickers.push({id:s.id,name:s.name,packId:s.packId,...(s.folderId!==undefined?{folderId:folderIds.has(s.folderId)?s.folderId:''}:{}),kind:s.kind,mime:s.mime,favorite:s.favorite,createdAt:s.createdAt,isSticker:s.isSticker,sourceUrl:typeof s.sourceUrl==='string'&&s.sourceUrl.startsWith('https://')?s.sourceUrl:undefined,blob,src,...(sound?{sound}:{}),...(restoredLayers?{soundLayers:restoredLayers}:{})});
  }return normalizeFolders(removeExamples({version:1,starterMemesVersion:1,packs:data.packs,...(data.folders!==undefined?{folders:data.folders}:{}),stickers}));
}
