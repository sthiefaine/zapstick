import test, {after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {IDBFactory} from 'fake-indexeddb';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=new Map(),nodeRequire=createRequire(import.meta.url);
function loadTS(file){
 const absolute=path.resolve(root,file);
 if(cache.has(absolute))return cache.get(absolute).exports;
 const module={exports:{}};cache.set(absolute,module);
 const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const require=specifier=>specifier.startsWith('.')?loadTS(path.resolve(path.dirname(absolute),specifier+(path.extname(specifier)?'':'.ts'))):nodeRequire(specifier);
 new Function('require','module','exports',code)(require,module,module.exports);return module.exports;
}
const store=loadTS('lib/stickers/store.ts'),{registerAudioWork}=loadTS('lib/stickers/audio.ts');
const originals=new Map(['indexedDB','FileReader'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:new IDBFactory()});
class BlobReader{
 result=null;error=null;onload=null;onerror=null;
 readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();},error=>{this.error=error;this.onerror?.();});}
}
Object.defineProperty(globalThis,'FileReader',{configurable:true,writable:true,value:BlobReader});
after(async()=>{await store.clearLocalData();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
beforeEach(async()=>{await store.clearLocalData();});

// A real PCM fixture: stereo pulses at known sample positions, with a canonical WAV header.
function wav({duration=.5,rate=48000,channels=2}={}){
 const frames=Math.round(duration*rate),bytes=new Uint8Array(44+frames*channels*2),view=new DataView(bytes.buffer);
 const text=(offset,value)=>{for(let i=0;i<value.length;i++)bytes[offset+i]=value.charCodeAt(i);};
 text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,rate,true);view.setUint32(28,rate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*channels*2,true);
 for(let frame=0;frame<frames;frame++)for(let channel=0;channel<channels;channel++)view.setInt16(44+(frame*channels+channel)*2,frame%2400<24?(channel?-.5:.5)*32767:0,true);
 return bytes;
}
function collection(sound={blob:new Blob([wav()],{type:'audio/wav'}),duration:.5,name:'Bip stéréo'}){
 return {version:1,packs:[],stickers:[{id:'sound-sticker',name:'Animation',packId:'',kind:'animated',mime:'image/webp',blob:new Blob(['visual-bytes'],{type:'image/webp'}),favorite:true,createdAt:1,isSticker:true,...(sound?{sound}:{})}]};
}
function layeredCollection(){
 const value=collection();
 value.stickers[0].soundLayers=[
  {blob:new Blob([wav({channels:1})],{type:'audio/wav'}),duration:.5,name:'Voix'},
  {blob:new Blob([wav({rate:44100})],{type:'audio/wav'}),duration:.5,name:'Musique'},
 ];
 return value;
}
const backupFile=data=>new File([JSON.stringify(data)],'backup.json',{type:'application/json'});
async function backupData(value=collection()){return JSON.parse(await(await store.createBackup(value)).text());}

test('saved audio survives IndexedDB and a portable JSON backup byte for byte',async()=>{
 const value=collection();await store.saveCollection(value);
 const loaded=await store.loadCollection(),sound=loaded.stickers[0].sound;
 assert.equal(sound.name,'Bip stéréo');assert.equal(sound.duration,.5);assert.equal(sound.blob.type,'audio/wav');
 assert.deepEqual(new Uint8Array(await sound.blob.arrayBuffer()),wav());
 const data=await backupData(loaded),serialized=data.stickers[0].sound;
 assert.equal(serialized.mime,'audio/wav');assert.equal(Object.hasOwn(serialized,'blob'),false);
 assert.equal(serialized.data,`data:audio/wav;base64,${Buffer.from(wav()).toString('base64')}`);
 await store.clearLocalData();
 const restored=await store.restore(backupFile(data));await store.saveCollection(restored);
 const reloaded=(await store.loadCollection()).stickers[0];
 assert.equal(await reloaded.blob.text(),'visual-bytes');assert.equal(reloaded.sound.name,sound.name);assert.equal(reloaded.sound.duration,sound.duration);
 assert.deepEqual(new Uint8Array(await reloaded.sound.blob.arrayBuffer()),wav());
});

test('older backups without sound remain readable without inventing an audio track',async()=>{
 const restored=await store.restore(backupFile(await backupData(collection(null))));
 assert.equal(Object.hasOwn(restored.stickers[0],'sound'),false);
 assert.equal(Object.hasOwn(restored.stickers[0],'soundLayers'),false);
 assert.equal(await restored.stickers[0].blob.text(),'visual-bytes');
});

test('two editable sound layers and their composite survive IndexedDB and JSON byte for byte',async()=>{
 const value=layeredCollection(),expected=value.stickers[0];
 await store.saveCollection(value);
 const loaded=await store.loadCollection(),saved=loaded.stickers[0];
 assert.deepEqual(saved.soundLayers.map(layer=>layer.name),['Voix','Musique']);
 const data=await backupData(loaded),serialized=data.stickers[0];
 assert.equal(serialized.soundLayers.length,2);
 for(const [index,layer] of serialized.soundLayers.entries()){
  assert.equal(layer.mime,'audio/wav');assert.equal(Object.hasOwn(layer,'blob'),false);
  assert.equal(layer.data,`data:audio/wav;base64,${Buffer.from(await expected.soundLayers[index].blob.arrayBuffer()).toString('base64')}`);
 }
 await store.clearLocalData();
 const restored=await store.restore(backupFile(data));await store.saveCollection(restored);
 const roundtrip=(await store.loadCollection()).stickers[0];
 for(const key of ['sound','soundLayers']){
  const actual=key==='sound'?[roundtrip.sound]:roundtrip.soundLayers,original=key==='sound'?[expected.sound]:expected.soundLayers;
  assert.equal(actual.length,original.length);
  for(const [index,layer] of actual.entries()){
   assert.equal(layer.name,original[index].name);assert.equal(layer.duration,original[index].duration);
   assert.deepEqual(new Uint8Array(await layer.blob.arrayBuffer()),new Uint8Array(await original[index].blob.arrayBuffer()));
  }
 }
});

test('legacy single-sound backups stay single-sound while one editable layer is also supported',async()=>{
 const legacy=await store.restore(backupFile(await backupData()));
 assert.equal(Object.hasOwn(legacy.stickers[0],'soundLayers'),false);
 const value=layeredCollection();value.stickers[0].soundLayers.length=1;
 await store.saveCollection(value);
 const restored=await store.restore(backupFile(await backupData(value)));
 assert.equal(restored.stickers[0].soundLayers.length,1);
 assert.equal(restored.stickers[0].soundLayers[0].name,'Voix');
 assert.equal(Object.hasOwn(restored.stickers[0].soundLayers[0],'volume'),false);
 assert.equal(Object.hasOwn(restored.stickers[0].soundLayers[0],'offset'),false);
});

test('raw one- and two-second clips retain their zero and delayed timeline positions through IndexedDB and JSON',async()=>{
 const value=collection({blob:new Blob([wav({duration:6})],{type:'audio/wav'}),duration:6,name:'Mix six seconds'});
 value.stickers[0].soundLayers=[
  {blob:new Blob([wav({duration:1,channels:1})],{type:'audio/wav'}),duration:1,name:'First clip',volume:1,offset:0},
  {blob:new Blob([wav({duration:2,rate:44100})],{type:'audio/wav'}),duration:2,name:'Later clip',volume:.25,offset:3},
 ];
 await store.saveCollection(value);
 const loaded=await store.loadCollection();assert.deepEqual(loaded.stickers[0].soundLayers.map(layer=>layer.offset),[0,3]);
 const data=await backupData(loaded);assert.deepEqual(data.stickers[0].soundLayers.map(layer=>layer.offset),[0,3]);
 assert.equal(Object.hasOwn(data.stickers[0].sound,'offset'),false);
 await store.clearLocalData();const restored=await store.restore(backupFile(data));await store.saveCollection(restored);
 const saved=(await store.loadCollection()).stickers[0];
 assert.equal(saved.sound.duration,6);assert.deepEqual(saved.soundLayers.map(layer=>layer.duration),[1,2]);
 assert.deepEqual(saved.soundLayers.map(layer=>layer.offset),[0,3]);
 assert.deepEqual(saved.soundLayers.map(layer=>layer.volume),[1,.25]);
 for(const [index,layer] of saved.soundLayers.entries())assert.deepEqual(new Uint8Array(await layer.blob.arrayBuffer()),new Uint8Array(await value.stickers[0].soundLayers[index].blob.arrayBuffer()));
});

test('negative timeline offsets and both six-second bounds remain editable metadata',async()=>{
 for(const offsets of [[-1.25,0],[-6,6]]){
  const value=layeredCollection();value.stickers[0].soundLayers.forEach((layer,index)=>{layer.offset=offsets[index];});
  await store.saveCollection(value);const loaded=await store.loadCollection();
  assert.deepEqual(loaded.stickers[0].soundLayers.map(layer=>layer.offset),offsets);
  const restored=await store.restore(backupFile(await backupData(loaded)));
  assert.deepEqual(restored.stickers[0].soundLayers.map(layer=>layer.offset),offsets);
 }
});

test('layer offsets reject non-finite values, invalid types and values outside minus-six to six',async()=>{
 const data=await backupData(layeredCollection());
 for(const offset of [-6.01,6.01,NaN,Infinity,-Infinity,null,'0',{}]){
  const value=layeredCollection();value.stickers[0].soundLayers[1].offset=offset;
  await assert.rejects(store.saveCollection(value),/Son enregistré/);
  await assert.rejects(store.createBackup(value),/Son enregistré/);
  const input=structuredClone(data);input.stickers[0].soundLayers[1].offset=offset;
  await assert.rejects(store.restore(backupFile(input)),/Son enregistré/);
 }
});

test('muted and quiet layer volumes survive reload and backup while their editable WAV samples remain intact',async()=>{
 const value=layeredCollection();value.stickers[0].soundLayers[0].volume=0;value.stickers[0].soundLayers[1].volume=.25;
 await store.saveCollection(value);
 const loaded=await store.loadCollection();assert.deepEqual(loaded.stickers[0].soundLayers.map(layer=>layer.volume),[0,.25]);
 const data=await backupData(loaded);assert.deepEqual(data.stickers[0].soundLayers.map(layer=>layer.volume),[0,.25]);
 assert.equal(Object.hasOwn(data.stickers[0].sound,'volume'),false,'the already-mixed composite has no separate gain');
 await store.clearLocalData();const restored=await store.restore(backupFile(data));await store.saveCollection(restored);
 const layers=(await store.loadCollection()).stickers[0].soundLayers;
 assert.deepEqual(layers.map(layer=>layer.volume),[0,.25]);
 for(const [index,layer] of layers.entries())assert.deepEqual(new Uint8Array(await layer.blob.arrayBuffer()),new Uint8Array(await value.stickers[0].soundLayers[index].blob.arrayBuffer()));
 assert.ok(new Uint8Array(await layers[0].blob.arrayBuffer()).subarray(44).some(sample=>sample!==0),'muting is metadata; the original samples can still be unmuted');
});

test('layer volumes reject non-finite values, invalid types and values outside zero to one',async()=>{
 const data=await backupData(layeredCollection());
 for(const volume of [-.01,1.01,NaN,Infinity,-Infinity,null,'0.5']){
  const value=layeredCollection();value.stickers[0].soundLayers[1].volume=volume;
  await assert.rejects(store.saveCollection(value),/Son enregistré/);
  await assert.rejects(store.createBackup(value),/Son enregistré/);
  const input=structuredClone(data);input.stickers[0].soundLayers[1].volume=volume;
  await assert.rejects(store.restore(backupFile(input)),/Son enregistré/);
 }
 const full=layeredCollection();full.stickers[0].soundLayers[0].volume=1;
 const restored=await store.restore(backupFile(await backupData(full)));
 assert.equal(restored.stickers[0].soundLayers[0].volume,1);
});

test('layer arrays reject missing mixes, a third track, empty slots and invalid WAVs without replacing the library',async()=>{
 await store.saveCollection(collection());
 const good=layeredCollection(),layers=good.stickers[0].soundLayers;
 for(const soundLayers of [null,{},[],[...layers,layers[0]],[undefined],[layers[0],null]]){
  const value=layeredCollection();value.stickers[0].soundLayers=soundLayers;
  await assert.rejects(store.saveCollection(value),/Son enregistré/);
  await assert.rejects(store.createBackup(value),/Son enregistré/);
 }
 const missingMix=layeredCollection();delete missingMix.stickers[0].sound;
 await assert.rejects(store.saveCollection(missingMix),/Son enregistré/);
 await assert.rejects(store.createBackup(missingMix),/Son enregistré/);
 const corrupt=layeredCollection();corrupt.stickers[0].soundLayers[1].blob=new Blob(['bad wave'],{type:'audio/wav'});
 await assert.rejects(store.saveCollection(corrupt),/WAV/);
 await assert.rejects(store.createBackup(corrupt),/WAV/);
 const tooLong=layeredCollection();tooLong.stickers[0].soundLayers[0]={blob:new Blob([wav({duration:6.05})],{type:'audio/wav'}),duration:6.05,name:'Too long'};
 await assert.rejects(store.saveCollection(tooLong),/Son enregistré/);
 assert.equal(Object.hasOwn((await store.loadCollection()).stickers[0],'soundLayers'),false);
 const data=await backupData(good),base=structuredClone(data);
 for(const savedLayers of [null,{},[],[...base.stickers[0].soundLayers,base.stickers[0].soundLayers[0]],[null]]){
  const input=structuredClone(base);input.stickers[0].soundLayers=savedLayers;
  await assert.rejects(store.restore(backupFile(input)),/Son enregistré/);
 }
 const noMix=structuredClone(base);delete noMix.stickers[0].sound;
 await assert.rejects(store.restore(backupFile(noMix)),/Son enregistré/);
 for(const changes of [{mime:'audio/mpeg'},{duration:0},{duration:.25},{data:'https://example.com/voice.wav'},{data:'data:audio/wav;base64,YmFkIHdhdmU='}]){
  const input=structuredClone(base);Object.assign(input.stickers[0].soundLayers[1],changes);
  await assert.rejects(store.restore(backupFile(input)),/Son enregistré|WAV/);
 }
});

test('PCM headers, payload boundaries, block sizes and measured duration are validated before saving',async()=>{
 await store.saveCollection(collection(null));
 const mutations=[
  bytes=>{bytes[0]=0;},
  bytes=>new DataView(bytes.buffer).setUint32(4,bytes.length-9,true),
  bytes=>new DataView(bytes.buffer).setUint16(20,3,true),
  bytes=>new DataView(bytes.buffer).setUint16(22,3,true),
  bytes=>new DataView(bytes.buffer).setUint32(24,0,true),
  bytes=>new DataView(bytes.buffer).setUint32(28,123,true),
  bytes=>new DataView(bytes.buffer).setUint16(32,1,true),
  bytes=>new DataView(bytes.buffer).setUint16(34,32,true),
  bytes=>new DataView(bytes.buffer).setUint32(40,bytes.length,true),
  bytes=>new DataView(bytes.buffer).setUint32(40,0,true),
 ];
 for(const mutate of mutations){const bytes=wav();mutate(bytes);await assert.rejects(store.saveCollection(collection({blob:new Blob([bytes],{type:'audio/wav'}),duration:.5,name:'Bad'})),/WAV/);}
 await assert.rejects(store.saveCollection(collection({blob:new Blob([wav().subarray(0,-1)],{type:'audio/wav'}),duration:.5,name:'Truncated'})),/WAV/);
 await assert.rejects(store.saveCollection(collection({blob:new Blob([wav()],{type:'audio/wav'}),duration:.4,name:'Wrong duration'})),/WAV/);
 assert.equal(Object.hasOwn((await store.loadCollection()).stickers[0],'sound'),false);
});

test('sound metadata and byte limits are enforced for saving and restoring',async()=>{
 const good=collection().stickers[0].sound;
 for(const overrides of [{duration:0},{duration:-1},{duration:NaN},{duration:Infinity},{duration:6.2},{name:'x'.repeat(121)},{name:'bad\u0000name'},{blob:new Blob([wav()],{type:'audio/mpeg'})}])await assert.rejects(store.saveCollection(collection({...good,...overrides})),/Son enregistré/);
 await assert.rejects(store.saveCollection(collection({...good,blob:new Blob([new Uint8Array(store.MAX_SAVED_AUDIO_BYTES+1)],{type:'audio/wav'})})),/2,4 Mo/);
 await assert.rejects(store.createBackup(collection({...good,duration:6.2})),/Son enregistré/);
 const data=await backupData();
 for(const overrides of [{mime:'audio/mpeg'},{duration:null},{duration:0},{duration:6.2},{name:'x'.repeat(121)},{data:'data:audio/mpeg;base64,AAAA'},{data:'data:audio/wav;base64,not base64'},{data:'https://example.com/sound.wav'}]){
  const input=structuredClone(data);Object.assign(input.stickers[0].sound,overrides);await assert.rejects(store.restore(backupFile(input)),/Son enregistré|WAV/);
 }
 const malformed=structuredClone(data),bytes=wav();new DataView(bytes.buffer).setUint32(40,3,true);malformed.stickers[0].sound.data=`data:audio/wav;base64,${Buffer.from(bytes).toString('base64')}`;
 await assert.rejects(store.restore(backupFile(malformed)),/WAV/);
 const oversized=structuredClone(data);oversized.stickers[0].sound.data='data:audio/wav;base64,'+'A'.repeat(4*Math.ceil(store.MAX_SAVED_AUDIO_BYTES/3)+4);
 await assert.rejects(store.restore(backupFile(oversized)),/Son enregistré/);
});

test('a valid six-second stereo track remains accepted and restore never fetches an external audio URL',async()=>{
 const sound={blob:new Blob([wav({duration:6})],{type:'audio/wav'}),duration:6,name:'Six seconds'};
 await store.saveCollection(collection(sound));
 const data=await backupData(collection(sound)),originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(input,...args)=>{requests.push(String(input));assert.ok(String(input).startsWith('data:'));return originalFetch(input,...args);};
 try{const restored=await store.restore(backupFile(data));assert.equal(restored.stickers[0].sound.duration,6);assert.equal(requests.length,2);}finally{globalThis.fetch=originalFetch;}
});

test('erasure cancels registered audio before a queued save finishes and removes every sound Blob',async()=>{
 await store.saveCollection(collection());
 let release,enteredResolve,stopped=0;
 const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{enteredResolve=resolve;});
 const blob=new Blob([wav()],{type:'audio/wav'}),read=blob.arrayBuffer.bind(blob);
 blob.arrayBuffer=async()=>{enteredResolve();await gate;return read();};
 const saving=store.saveCollection(collection({blob,duration:.5,name:'Queued'}));await entered;
 registerAudioWork(()=>{stopped++;});
 const clearing=store.clearLocalData();
 for(let i=0;i<10&&!stopped;i++)await Promise.resolve();
 assert.equal(stopped,1,'microphone/playback cleanup must not wait for the storage queue');
 release();await Promise.all([saving,clearing]);
 assert.deepEqual((await store.loadCollection()).stickers,[]);
});

test('backup rejects the aggregate audio budget before any base64 reader runs',async()=>{
 const sound={blob:new Blob([wav({duration:6,rate:96000})],{type:'audio/wav'}),duration:6,name:'Shared six-second PCM'};
 const base=collection(sound),sticker=base.stickers[0];
 const value={...base,stickers:Array.from({length:45},(_,index)=>({...sticker,id:`audio-${index}`}))};
 const Reader=globalThis.FileReader;let reads=0;
 globalThis.FileReader=class{readAsDataURL(){reads++;throw new Error('Base64 must not be allocated.');}};
 try{await assert.rejects(store.createBackup(value),/La sauvegarde dépasse 100 Mo/);assert.equal(reads,0);}finally{globalThis.FileReader=Reader;}
});

test('backup budget counts both editable layers as well as the composite before any base64 allocation',async()=>{
 const sound={blob:new Blob([wav({duration:6,rate:96000})],{type:'audio/wav'}),duration:6,name:'Shared six-second PCM'};
 const base=collection(sound),sticker={...base.stickers[0],soundLayers:[sound,{...sound,name:'Second layer'}]};
 const value={...base,stickers:Array.from({length:12},(_,index)=>({...sticker,id:`mixed-${index}`}))};
 assert.ok(12*4*Math.ceil(sound.blob.size/3)<100*1024*1024,'the composite alone would fit');
 assert.ok(12*3*4*Math.ceil(sound.blob.size/3)>100*1024*1024,'all three attachments exceed the limit');
 const Reader=globalThis.FileReader;let reads=0;
 globalThis.FileReader=class{readAsDataURL(){reads++;throw new Error('All audio attachments must be budgeted first.');}};
 try{await assert.rejects(store.createBackup(value),/La sauvegarde dépasse 100 Mo/);assert.equal(reads,0);}finally{globalThis.FileReader=Reader;}
});

test('backup budget includes JSON metadata and data URL prefixes beyond the base64 payload',async()=>{
 // Twenty-five references share only 3 MiB of input storage, but base64 alone is exactly 100 MiB.
 const blob=new Blob([new Uint8Array(3*1024*1024)],{type:'image/webp'}),base=collection(null),sticker=base.stickers[0];
 const value={...base,stickers:Array.from({length:25},(_,index)=>({...sticker,id:`image-${index}`,name:'Été « 😺 »',blob}))};
 assert.equal(25*4*Math.ceil(blob.size/3),100*1024*1024);
 const Reader=globalThis.FileReader;let reads=0;
 globalThis.FileReader=class{readAsDataURL(){reads++;throw new Error('Metadata must be budgeted first.');}};
 try{await assert.rejects(store.createBackup(value),/La sauvegarde dépasse 100 Mo/);assert.equal(reads,0);}finally{globalThis.FileReader=Reader;}
});

test('bundled GIFs are resolved within the aggregate budget before any base64 allocation',async()=>{
 const {HOME_MEMES}=loadTS('lib/stickers/home-memes.ts');
 const blob=new Blob([new Uint8Array(3*1024*1024)],{type:'image/webp'}),base=collection(null),sticker=base.stickers[0];
 const value={...base,stickers:[...Array.from({length:24},(_,index)=>({...sticker,id:`image-${index}`,blob})),{...sticker,id:'local-gif',mime:'image/gif',blob:undefined,src:HOME_MEMES[0].src}]};
 const Reader=globalThis.FileReader,originalFetch=globalThis.fetch;let reads=0,fetches=0;
 globalThis.FileReader=class{readAsDataURL(){reads++;throw new Error('The GIF must be budgeted first.');}};
 globalThis.fetch=async(input)=>{fetches++;assert.equal(input,HOME_MEMES[0].src);assert.equal(reads,0);return new Response(new Blob([blob],{type:'image/gif'}),{headers:{'content-type':'image/gif'}});};
 try{await assert.rejects(store.createBackup(value),/La sauvegarde dépasse 100 Mo/);assert.equal(fetches,1);assert.equal(reads,0);}finally{globalThis.FileReader=Reader;globalThis.fetch=originalFetch;}
});

test('backup serializes image and sound Blobs sequentially while preserving every attachment',async()=>{
 const base=collection(),value={...base,stickers:Array.from({length:4},(_,index)=>({...base.stickers[0],id:`sound-${index}`}))};
 const Reader=globalThis.FileReader;let active=0,maximum=0,reads=0;
 globalThis.FileReader=class extends BlobReader{
  readAsDataURL(blob){active++;reads++;maximum=Math.max(maximum,active);const onload=this.onload;this.onload=()=>{active--;onload?.();};super.readAsDataURL(blob);}
 };
 try{
  const backup=await store.createBackup(value),data=JSON.parse(await backup.text());
  assert.equal(reads,8);assert.equal(maximum,1);assert.equal(active,0);
  assert.ok(data.stickers.every(sticker=>sticker.data.startsWith('data:image/webp;base64,')&&sticker.sound.data.startsWith('data:audio/wav;base64,')));
  const restored=await store.restore(new File([backup],'sequential.json'));
  assert.deepEqual(restored.stickers.map(sticker=>sticker.id),value.stickers.map(sticker=>sticker.id));
 }finally{globalThis.FileReader=Reader;}
});

test('backup reads the composite, both layers and visual sequentially for every sticker',async()=>{
 const base=layeredCollection(),value={...base,stickers:Array.from({length:3},(_,index)=>({...base.stickers[0],id:`mixed-${index}`}))};
 const Reader=globalThis.FileReader;let active=0,maximum=0,reads=0;
 globalThis.FileReader=class extends BlobReader{
  readAsDataURL(blob){active++;reads++;maximum=Math.max(maximum,active);const onload=this.onload;this.onload=()=>{active--;onload?.();};super.readAsDataURL(blob);}
 };
 try{
  const backup=await store.createBackup(value),data=JSON.parse(await backup.text());
  assert.equal(reads,12);assert.equal(maximum,1);assert.equal(active,0);
  assert.ok(data.stickers.every(sticker=>sticker.soundLayers.length===2&&sticker.soundLayers.every(layer=>layer.data.startsWith('data:audio/wav;base64,'))));
  const restored=await store.restore(new File([backup],'two-layers.json'));
  assert.deepEqual(restored.stickers.map(sticker=>sticker.soundLayers.map(layer=>layer.name)),[['Voix','Musique'],['Voix','Musique'],['Voix','Musique']]);
 }finally{globalThis.FileReader=Reader;}
});
