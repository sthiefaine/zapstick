import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function moduleFromTS(path){const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);}
const {allowedMedia,limitedBody}=await moduleFromTS('../lib/stickers/remote.ts');
test('direct imports accept supported HTTPS origins and rejects local addresses and lookalikes',()=>{
 for(const input of ['https://video.twimg.com/tweet_video/a.mp4','https://pbs.twimg.com/media/a.jpg','https://media2.giphy.com/a.gif','https://media.tenor.com/a.gif'])assert.ok(allowedMedia(input));
 for(const input of ['http://video.twimg.com/a','https://127.0.0.1/a','https://[::1]/a','https://169.254.169.254/a','https://video.twimg.com.evil.example/a','https://evil.example/?u=video.twimg.com','https://user:pass@video.twimg.com/a','https://video.twimg.com:444/a','file:///etc/passwd'])assert.equal(allowedMedia(input),null);
});
test('streaming limit rejects oversized bodies even without Content-Length',async()=>{
 const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(6));c.enqueue(new Uint8Array(6));c.close();}});
 await assert.rejects(limitedBody(new Response(body),10),/20 Mo/);
 const result=await limitedBody(new Response('hello',{headers:{'content-type':'image/gif'}}),10);
 assert.equal(result.size,5);assert.equal(result.type,'image/gif');
});
test('announced oversized files are refused before buffering',async()=>{
 await assert.rejects(limitedBody(new Response('x',{headers:{'content-length':'21'}}),20),/20 Mo/);
});

const {initialCollection,removeExamples}=await moduleFromTS('../lib/stickers/types.ts');
test('new collections start empty',()=>{
 assert.deepEqual(initialCollection(),{version:1,packs:[],stickers:[]});
});
test('removing first-release examples preserves user imports and custom packs',()=>{
 const userMedia={id:'user-upload',packId:'animals',blob:new Blob(['image']),name:'Photo personnelle'};
 const personal={id:'custom-pack',name:'Mon pack',color:'#ddd7ce',kind:'static'};
 const value={version:1,packs:[{id:'animals',name:'Petites bêtes'},personal],stickers:[{id:'starter-0',src:'/stickers/0.svg',packId:'animals'},userMedia,{id:'own-sticker',packId:'custom-pack'}]};
 const cleaned=removeExamples(value);
 assert.deepEqual(cleaned.packs,[personal]);
 assert.equal(cleaned.stickers.length,2);
 assert.equal(cleaned.stickers[0].blob,userMedia.blob);
 assert.equal(cleaned.stickers[0].packId,'');
 assert.equal(cleaned.stickers[1].packId,'custom-pack');
 assert.deepEqual(removeExamples(cleaned),cleaned);
 assert.equal(value.stickers[1].packId,'animals');
});
test('a default pack renamed by the user is retained',()=>{
 const value={version:1,stickers:[],packs:[{id:'animals',name:'Mon nouveau nom'}]};
 assert.deepEqual(removeExamples(value),value);
});

const remoteCode=ts.transpileModule(await readFile(new URL('../lib/stickers/remote.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const remoteURL=`data:text/javascript;base64,${Buffer.from(remoteCode).toString('base64')}`;
const importCode=ts.transpileModule(await readFile(new URL('../lib/stickers/import.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from './remote'",`from '${remoteURL}'`);
const {resolveImport,downloadRemote}=await import(`data:text/javascript;base64,${Buffer.from(importCode).toString('base64')}`);
test('X resolution and media download contact external origins directly without credentials',async()=>{
 const originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=async(input,options)=>{
  requests.push({url:String(input),options});
  if(String(input).startsWith('https://api.fxtwitter.com/2/status/'))return Response.json({code:200,status:{author:{screen_name:'test'},media:{all:[{url:'https://video.twimg.com/tweet_video/test.mp4',type:'gif'}]}}});
  return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'video/mp4'}});
 };
 try{
  const result=await resolveImport('https://x.com/person/status/2116556868600664480');
  assert.equal(result.media.length,1);
  const blob=await downloadRemote(result.media[0].url);
  assert.equal(blob.type,'video/mp4');assert.equal(blob.size,3);
  assert.equal(requests.length,2);
  for(const request of requests){assert.ok(request.url.startsWith('https://'));assert.equal(request.options.mode,'cors');assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.ok(!request.url.includes('/api/import'));assert.ok(!request.url.includes('/api/media'));}
 }finally{globalThis.fetch=originalFetch;}
});
test('CORS failures explain the local-file alternative',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
 try{await assert.rejects(downloadRemote('https://video.twimg.com/test.mp4'),/Importez le fichier/);}finally{globalThis.fetch=originalFetch;}
});
