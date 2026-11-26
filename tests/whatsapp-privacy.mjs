import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {IDBFactory} from 'fake-indexeddb';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nodeRequire=createRequire(import.meta.url);
function loader(){
 const cache=new Map();
 function load(file){
  const absolute=path.resolve(root,file);
  if(cache.has(absolute))return cache.get(absolute).exports;
  const module={exports:{}};cache.set(absolute,module);
  const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const require=specifier=>specifier.startsWith('.')?load(path.resolve(path.dirname(absolute),specifier+(path.extname(specifier)?'':'.ts'))):nodeRequire(specifier);
  new Function('require','module','exports',code)(require,module,module.exports);return module.exports;
 }
 return load;
}

test('erasing the local collection clears WhatsApp receipts even when server cancellation is offline',async t=>{
 const keys=['indexedDB','localStorage','fetch'];
 const originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const values=new Map(),calls=[];
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 Object.defineProperty(globalThis,'fetch',{configurable:true,value:async(url,options)=>{calls.push({url,options});throw new Error('offline');}});
 t.after(()=>{for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 const load=loader(),store=load('lib/stickers/store.ts');
 const id=randomBytes(16).toString('base64url'),receipt=randomBytes(32).toString('base64url');
 storage.setItem('zapstick-whatsapp-transfers-v1',JSON.stringify({version:1,receipts:[{id,receipt,fingerprint:'a'.repeat(64),createdAt:Date.now(),expiresAt:Date.now()+600000,locale:'fr',attempted:true,state:'awaiting_message'}]}));
 storage.setItem('zapstick-preferences-v1','{"theme":"dark"}');
 await store.saveCollection({version:1,packs:[],stickers:[{id:'local',name:'Local image',packId:'',kind:'static',mime:'image/png',blob:new Blob(['image']),favorite:false,createdAt:1,isSticker:false}]});
 await store.clearLocalData();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'/api/whatsapp/transfers/'+id);
 assert.equal(calls[0].options.method,'DELETE');
 assert.equal(calls[0].options.headers.Authorization,'Bearer '+receipt);
 assert.equal(storage.getItem('zapstick-whatsapp-transfers-v1'),null);
 assert.equal(storage.getItem('zapstick-preferences-v1'),null);
 assert.deepEqual((await store.loadCollection()).stickers,[]);
});
