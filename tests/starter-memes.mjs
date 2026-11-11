import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {IDBFactory} from 'fake-indexeddb';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=new Map(),nodeRequire=createRequire(import.meta.url);
function loadTS(file){const absolute=path.resolve(root,file);if(cache.has(absolute))return cache.get(absolute).exports;const module={exports:{}};cache.set(absolute,module);const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const require=name=>name.startsWith('.')?loadTS(path.resolve(path.dirname(absolute),name+(path.extname(name)?'':'.ts'))):nodeRequire(name);new Function('require','module','exports',code)(require,module,module.exports);return module.exports;}
const {HOME_MEMES}=loadTS('lib/stickers/home-memes.ts'),{withStarterMemes,MEMES_FOLDER_ID}=loadTS('lib/stickers/starter-memes.ts'),{inspectGifAnimation}=loadTS('lib/stickers/gif-export-core.ts');
const originalGlobals=new Map(['indexedDB','FileReader'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
class BlobReader{readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result=`data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onload?.();});}}
Object.defineProperty(globalThis,'FileReader',{configurable:true,value:BlobReader});
after(()=>{for(const [key,descriptor]of originalGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
const store=loadTS('lib/stickers/store.ts');
test('six requested local GIFs are real animations and the one-time addition preserves personal media and ordering',()=>{
 const personal={id:'mine',name:'Mine',kind:'static',mime:'image/png',blob:new Blob(['private']),packId:'',favorite:true,createdAt:1,isSticker:false};
 const original={version:1,stickers:[personal],packs:[],folders:[{id:'own',name:'Own',color:'#ffffff'}]},seeded=withStarterMemes(original,source=>source==='Mèmes'?'Memes':source);
 assert.equal(original.stickers.length,1);assert.equal(seeded.stickers[0],personal);assert.equal(seeded.packs,original.packs);assert.equal(seeded.folders[0],original.folders[0]);assert.equal(seeded.stickers.length,7);assert.equal(seeded.folders[1].id,MEMES_FOLDER_ID);assert.equal(seeded.folders[1].name,'Memes');
 assert.equal(new Set(seeded.stickers.map(item=>item.id)).size,7);
 for(const meme of HOME_MEMES){assert.ok(meme.src.startsWith('/memes/'));const bytes=new Uint8Array(fs.readFileSync(path.join(root,'public',meme.src)));const info=inspectGifAnimation(bytes);assert.ok(info.frames>1);assert.ok(info.width<=160&&info.height<=160);}
 const edited={...seeded,stickers:[personal],folders:original.folders};assert.equal(withStarterMemes(edited),edited,'removed memes must not reappear');
});
test('stored onboarding is idempotent, deletions persist, and backups embed local GIF bytes for portable restoration',async()=>{
 const first=await store.loadCollectionWithStarterMemes();assert.equal(first.stickers.length,6);
 const second=await store.loadCollectionWithStarterMemes();assert.deepEqual(second.stickers.map(item=>item.id),first.stickers.map(item=>item.id));
 const edited={...second,stickers:second.stickers.slice(1).map((item,index)=>index?item:{...item,name:'My reaction',favorite:true})};await store.saveCollection(edited);
 const reloaded=await store.loadCollectionWithStarterMemes();assert.equal(reloaded.stickers.length,5);assert.equal(reloaded.stickers[0].name,'My reaction');assert.equal(reloaded.stickers[0].favorite,true);
 const originalFetch=globalThis.fetch;let localRequests=0;
 globalThis.fetch=async(input,options)=>{if(typeof input==='string'&&input.startsWith('/memes/')){localRequests++;assert.equal(options.credentials,'same-origin');return new Response(fs.readFileSync(path.join(root,'public',input)),{headers:{'content-type':'image/gif'}});}return originalFetch(input,options);};
 try{const backup=await store.createBackup(reloaded),json=JSON.parse(await backup.text());assert.equal(localRequests,5);assert.ok(json.stickers.every(item=>item.data.startsWith('data:image/gif;base64,')&&!item.src));const restored=await store.restore(new File([backup],'memes.json'));assert.equal(restored.starterMemesVersion,1);for(const item of restored.stickers){const source=reloaded.stickers.find(value=>value.id===item.id);assert.deepEqual(new Uint8Array(await item.blob.arrayBuffer()),new Uint8Array(fs.readFileSync(path.join(root,'public',source.src))));}}
 finally{globalThis.fetch=originalFetch;}
});
test('old backups stay exact and local erasure does not repopulate the library with defaults',async()=>{
 const restored=await store.restore(new File([JSON.stringify({version:1,packs:[],stickers:[]})],'old.json'));
 assert.equal(restored.starterMemesVersion,1);await store.saveCollection(restored);assert.equal((await store.loadCollectionWithStarterMemes()).stickers.length,0);
 await store.clearLocalData();const empty=await store.loadCollectionWithStarterMemes();assert.equal(empty.stickers.length,0);assert.equal(empty.starterMemesVersion,1);
});
