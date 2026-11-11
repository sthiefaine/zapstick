import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleURL=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const coreURL=moduleURL(compile(await readFile(new URL('../lib/stickers/background-removal-core.ts',import.meta.url),'utf8')));
const core=await import(coreURL);
const source=compile(await readFile(new URL('../lib/stickers/background-removal.ts',import.meta.url),'utf8')).replaceAll("'./background-removal-core'",JSON.stringify(coreURL)).replace(/new URL\('\.\/background-removal\.worker\.ts',\s*import\.meta\.url\)/g,JSON.stringify('https://zapstick.test/worker.js'));
const {removeImageBackground,clearBackgroundModelCache}=await import(moduleURL(source));
function png(width=640,height=480){const value=new Uint8Array(33);value.set([137,80,78,71,13,10,26,10]);const view=new DataView(value.buffer);view.setUint32(8,13);value.set([73,72,68,82],12);view.setUint32(16,width);view.setUint32(20,height);return value;}
test('camera allocation limits and animation rejection happen before decoding',()=>{
 assert.deepEqual(core.boundedDimensions(4000,3000),{width:1024,height:768});assert.deepEqual(core.boundedDimensions(200,100),{width:200,height:100});
 assert.deepEqual(core.inspectBackgroundImage(png()),{width:640,height:480});
 assert.throws(()=>core.inspectBackgroundImage(png(8000,6000)),error=>error.code==='too-large');
 assert.throws(()=>core.inspectBackgroundImage(new TextEncoder().encode('GIF89a')),error=>error.code==='animated');
 const webp=new Uint8Array(30);for(const [offset,text] of [[0,'RIFF'],[8,'WEBP'],[12,'VP8X']])webp.set(new TextEncoder().encode(text),offset);webp[20]=2;
 assert.throws(()=>core.inspectBackgroundImage(webp),error=>error.code==='animated');
});
test('inference RGB ignores source alpha and empty masks cannot replace the image',()=>{
 const tensor=core.prepareBackgroundTensor(new Uint8Array([255,0,0,0,0,255,0,255]));
 assert.equal(tensor.length,6);assert.ok(Math.abs(tensor[0]-(1-.485)/.229)<1e-6);assert.ok(Math.abs(tensor[2]+.456/.224)<1e-6);
 assert.deepEqual([...core.backgroundAlpha(new Float32Array([.25,.5,.75]))].filter((_,i)=>i%4===3),[0,128,255]);
 assert.throws(()=>core.backgroundAlpha(new Float32Array([0,0])),error=>error.code==='model');
 assert.throws(()=>core.backgroundAlpha(new Float32Array([0,NaN])),error=>error.code==='model');
});
const digest=Uint8Array.from(core.BACKGROUND_MODEL_SHA256.match(/../g),value=>parseInt(value,16));
async function browser(values,run){const previous=Object.fromEntries(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});try{return await run();}finally{for(const [key,value] of Object.entries(previous)){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}}
const supports={window:{},Worker:class{},OffscreenCanvas:class{},createImageBitmap:()=>{},crypto:{subtle:{digest:async()=>digest.buffer}}};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('invalid input never requests model weights or creates a worker',async()=>{
 let requests=0,workers=0;
 await browser({...supports,fetch:async()=>{requests++;},Worker:class{constructor(){workers++;}}},async()=>{
  await assert.rejects(removeImageBackground(new Blob(['not an image'])),error=>error.code==='invalid-image');
 });assert.equal(requests,0);assert.equal(workers,0);
});
test('clearing waits for an in-flight cache write and prevents later inference',async()=>{
 const events=[];let releaseWrite;
 const cache={match:async()=>undefined,put:async()=>{events.push('write-start');await new Promise(resolve=>{releaseWrite=resolve;});events.push('write-end');}};
 await browser({...supports,caches:{open:async()=>cache,delete:async()=>{events.push('delete');return true;}},fetch:async()=>new Response(new Uint8Array(core.BACKGROUND_MODEL_BYTES)),Worker:class{constructor(){events.push('worker');}}},async()=>{
  const job=removeImageBackground(new Blob([png()]));const outcome=job.catch(error=>error);
  for(let attempt=0;attempt<100&&!releaseWrite;attempt++)await tick();assert.ok(releaseWrite);
  const clear=clearBackgroundModelCache();await tick();assert.ok(!events.includes('delete'));releaseWrite();await clear;
  assert.equal((await outcome).code,'cancelled');assert.deepEqual(events,['write-start','write-end','delete']);
 });
});
test('cancellation terminates the worker and cached use sends no network request',async()=>{
 let worker,network=0,terminated=0;
 class FakeWorker{constructor(){worker=this;}postMessage(){}terminate(){terminated++;}}
 await browser({...supports,Worker:FakeWorker,fetch:async()=>{network++;},caches:{open:async()=>({match:async()=>new Response(new Uint8Array(core.BACKGROUND_MODEL_BYTES))}),delete:async()=>true}},async()=>{
  const controller=new AbortController(),job=removeImageBackground(new Blob([png()]),{signal:controller.signal}),outcome=job.catch(error=>error);
  for(let attempt=0;attempt<100&&!worker;attempt++)await tick();assert.ok(worker);controller.abort();assert.equal((await outcome).code,'cancelled');
 });assert.equal(network,0);assert.equal(terminated,1);
});
test('background controls and legal disclosures are translated for all eight locales',async()=>{
 const compiled=compile(await readFile(new URL('../lib/i18n/background-translations.ts',import.meta.url),'utf8'));
 const {backgroundTranslations}=await import(moduleURL(compiled));const keys=Object.keys(backgroundTranslations.fr);
 assert.equal(Object.keys(backgroundTranslations).length,8);
 for(const values of Object.values(backgroundTranslations)){assert.deepEqual(Object.keys(values),keys);for(const value of Object.values(values))assert.ok(value.trim());}
 for(const source of ['Rétablir le fond','Quand tu retires un fond'])assert.ok(keys.includes(source));
});
