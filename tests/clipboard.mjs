import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=new Map();
function loadTS(file){const absolute=path.resolve(root,file);if(cache.has(absolute))return cache.get(absolute).exports;const module={exports:{}};cache.set(absolute,module);const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const require=specifier=>loadTS(path.resolve(path.dirname(absolute),specifier+(path.extname(specifier)?'':'.ts')));new Function('require','module','exports',code)(require,module,module.exports);return module.exports;}
const {readClipboardLink,createClipboardReadSession}=loadTS('lib/stickers/clipboard.ts');
const {resolveImport}=loadTS('lib/stickers/import.ts');
test('clipboard reads only when an explicit caller supplies a secure reader',async()=>{
 let reads=0;
 const readText=async()=>{reads++;return'  https://x.com/person/status/2116556868600664480  \n';};
 await assert.rejects(readClipboardLink({secure:false,readText}),/nécessite HTTPS/);
 assert.equal(reads,0);
 await assert.rejects(readClipboardLink({secure:true}),/indisponible/);
 assert.equal(reads,0);
 assert.equal(await readClipboardLink({secure:true,readText}),'https://x.com/person/status/2116556868600664480');
 assert.equal(reads,1);
});
test('clipboard refusal and empty content have manual-paste fallbacks',async()=>{
 await assert.rejects(readClipboardLink({secure:true,readText:async()=>{throw new Error('NotAllowedError');}}),/refusé.*manuellement/);
 await assert.rejects(readClipboardLink({secure:true,readText:async()=>' \n\t '}),/vide.*manuellement/);
});
test('invalid clipboard contents and unsupported URLs make no network requests',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('unexpected request');};
 try{
  for(const value of ['not a link','javascript:alert(1)','http://video.twimg.com/file.mp4','https://name:password@video.twimg.com/file.mp4','https://video.twimg.com:444/file.mp4','https://evil.example/file.gif','https://x.com/person','https://x.com/person/status/no-id','https://x.com.evil.example/person/status/2116556868600664480','https://video.twimg.com/'+ 'a'.repeat(2050)]){
   await assert.rejects(async()=>resolveImport(await readClipboardLink({secure:true,readText:async()=>value})),undefined,value);
  }
  assert.equal(calls,0);
 }finally{globalThis.fetch=originalFetch;}
});
test('the fresh pasted URL is the URL resolved for importing',async()=>{
 const originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(input)=>{requests.push(String(input));return Response.json({code:200,status:{author:{screen_name:'clipboard'},media:{all:[{url:'https://video.twimg.com/tweet_video/clip.mp4',type:'gif'}]}}});};
 try{
  const pasted=await readClipboardLink({secure:true,readText:async()=>' https://x.com/new-user/status/2116556868600664480\n'});
  const result=await resolveImport(pasted);
  assert.deepEqual(requests,['https://api.fxtwitter.com/2/status/2116556868600664480']);
  assert.equal(result.source,'https://x.com/new-user/status/2116556868600664480');
  assert.equal(result.media.length,1);
 }finally{globalThis.fetch=originalFetch;}
});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
test('permission can remain pending without importing or timing out, then import after approval',async()=>{
 const grant=deferred(),session=createClipboardReadSession();let reads=0,imports=0;
 const reading=session.read({secure:true,readText:()=>{reads++;return grant.promise;}});
 assert.equal(reads,1,'readText runs synchronously in the caller gesture');
 let completed=false;const flow=reading.then(value=>{imports++;completed=true;return value;});
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.equal(completed,false);assert.equal(imports,0);assert.equal(session.pending,true);
 grant.resolve(' https://x.com/person/status/2116556868600664480 ');
 assert.equal(await flow,'https://x.com/person/status/2116556868600664480');assert.equal(imports,1);assert.equal(session.pending,false);
});
test('duplicate clicks never queue a second clipboard read or import',async()=>{
 const grant=deferred(),session=createClipboardReadSession();let reads=0;
 const options={secure:true,readText:()=>{reads++;return grant.promise;}};
 const first=session.read(options);assert.equal(session.read(options),null);assert.equal(session.read(options),null);assert.equal(reads,1);
 grant.resolve('https://media.tenor.com/example.gif');await first;assert.equal(session.pending,false);
});
test('cancel or Home aborts waiting and ignores a later grant without importing',async()=>{
 const grant=deferred(),session=createClipboardReadSession(),controller=new AbortController();let imports=0;
 const reading=session.read({secure:true,signal:controller.signal,readText:()=>grant.promise}).then(value=>{imports++;return value;});
 const cancelled=assert.rejects(reading,{name:'AbortError'});controller.abort();await cancelled;
 grant.resolve('https://media.tenor.com/late.gif');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(imports,0);assert.equal(session.pending,false);
 let reads=0;await assert.rejects(readClipboardLink({secure:true,signal:AbortSignal.abort(),readText:async()=>{reads++;return'';}}),{name:'AbortError'});assert.equal(reads,0);
});
test('a late cancelled read cannot release the lock of a new user request',async()=>{
 const stale=deferred(),fresh=deferred(),session=createClipboardReadSession(),controller=new AbortController();
 const first=session.read({secure:true,signal:controller.signal,readText:()=>stale.promise});
 const cancelled=assert.rejects(first,{name:'AbortError'});controller.abort();await cancelled;
 const second=session.read({secure:true,readText:()=>fresh.promise});
 stale.resolve('https://media.tenor.com/stale.gif');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(session.pending,true);assert.equal(session.read({secure:true,readText:()=>{throw new Error('duplicate');}}),null);
 fresh.resolve('https://media.tenor.com/fresh.gif');assert.equal(await second,'https://media.tenor.com/fresh.gif');assert.equal(session.pending,false);
});
test('browser dismissal remains a manual-paste fallback when the app did not cancel',async()=>{
 await assert.rejects(readClipboardLink({secure:true,readText:async()=>{throw new DOMException('Dismissed','AbortError');}}),/refusé.*manuellement/);
});
test('permission waiting and cancellation labels are translated in all eight languages',()=>{
 const {clipboardUxSources,clipboardUxTranslations}=loadTS('lib/i18n/clipboard-ux-translations.ts');
 assert.deepEqual(Object.keys(clipboardUxTranslations),['fr','en','pt-BR','es','de','zh-CN','ja','ru']);
 for(const locale of Object.keys(clipboardUxTranslations))for(const source of clipboardUxSources)assert.ok(clipboardUxTranslations[locale][source]?.trim(),`${locale}: ${source}`);
});
