import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const mod={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(new URL('../lib/stickers/audio-url.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(mod,mod.exports);
const{parseAudioUrl,importAudioUrl}=mod.exports;
test('audio URL policy accepts public HTTPS and rejects local, credentialed and alternate protocol URLs',()=>{
 assert.equal(parseAudioUrl(' https://cdn.example.org/a.mp3#t=1 ').href,'https://cdn.example.org/a.mp3');
 for(const value of ['http://a.com/s.mp3','file:///etc/passwd','https://user:pass@a.com','https://localhost/a','https://x.local/a','https://x.internal/a','https://127.0.0.1','https://0x7f000001','https://192.168.1.1','https://10.0.0.1','https://172.20.0.1','https://169.254.169.254','https://100.64.0.1','https://[::1]/','https://example.com:8443/','bad'])assert.throws(()=>parseAudioUrl(value),/HTTPS valide/);
});
test('direct imports omit credentials and redirects; MyInstants uses the bounded same-origin relay',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async(...args)=>{calls.push(args);return new Response(new Uint8Array([1,2,3]),{headers:{'Content-Type':'audio/mpeg','X-Audio-Name':encodeURIComponent('Mon son')}});};
 try{
  const result=await importAudioUrl('https://cdn.example.org/a.mp3',new AbortController().signal);assert.equal(result.blob.size,3);assert.equal(result.name,'Mon son');assert.equal(calls[0][1].mode,'cors');assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].redirect,'error');assert.equal(calls[0][1].referrerPolicy,'no-referrer');
  await importAudioUrl('https://www.myinstants.com/fr/instant/test/',new AbortController().signal);assert.match(calls[1][0],/^\/api\/audio\?url=https%3A/);
 }finally{globalThis.fetch=original;}
});
test('audio import rejects HTML, empty data and streams that exceed 5MiB even without Content-Length',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>new Response('<html>oops</html>',{headers:{'Content-Type':'text/html'}});await assert.rejects(importAudioUrl('https://a.com/a',new AbortController().signal),/son lisible/);
  globalThis.fetch=async()=>new Response(new Uint8Array(),{headers:{'Content-Type':'audio/mpeg'}});await assert.rejects(importAudioUrl('https://a.com/a',new AbortController().signal),/son lisible/);
  let cancelled=false;globalThis.fetch=async()=>new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'audio/mpeg'}});
  await assert.rejects(importAudioUrl('https://a.com/a',new AbortController().signal),/moins de 5 Mo/);assert.equal(cancelled,true);
 }finally{globalThis.fetch=original;}
});
test('relay errors are readable, browser denial has a file fallback and cancellation sends no request',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({error:'busy'},{status:429});await assert.rejects(importAudioUrl('https://myinstants.com/x',new AbortController().signal),/Trop d’imports/);
  globalThis.fetch=async()=>{throw new TypeError('CORS');};await assert.rejects(importAudioUrl('https://a.com/a',new AbortController().signal),/depuis ton appareil/);
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error();};const controller=new AbortController();controller.abort();await assert.rejects(importAudioUrl('https://a.com/a',controller.signal),{name:'AbortError'});assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
