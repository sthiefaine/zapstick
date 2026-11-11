import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=new Map();
function loadTS(file){const absolute=path.resolve(root,file);if(cache.has(absolute))return cache.get(absolute).exports;const module={exports:{}};cache.set(absolute,module);const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const require=specifier=>loadTS(path.resolve(path.dirname(absolute),specifier+(path.extname(specifier)?'':'.ts')));new Function('require','module','exports',code)(require,module,module.exports);return module.exports;}
const {readClipboardLink}=loadTS('lib/stickers/clipboard.ts');
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
