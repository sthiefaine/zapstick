import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {setTimeout as delay} from 'node:timers/promises';
const loaded={exports:{}};
const code=ts.transpileModule(fs.readFileSync(new URL('../lib/server/audio-import.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports',code)(loaded,loaded.exports);
const {validateMyInstantsUrl,extractMyInstantsAudio,sniffAudio,importMyInstantsAudio,createAudioImportHandler,AUDIO_IMPORT_LIMITS}=loaded.exports;
const page='https://www.myinstants.com/en/instant/working-cat/',media='https://www.myinstants.com/media/sounds/working-cat.mp3';
function mp3(){const bytes=new Uint8Array(417*3);for(const at of [0,417,834])bytes.set([255,251,144,0],at);return bytes;}
const sound=(options={})=>new Response(mp3(),{headers:{'Content-Type':'audio/mpeg',...options}});
const html=value=>new Response(value,{headers:{'Content-Type':'text/html; charset=utf-8'}});
const markup=`<meta content="Café &amp; chat - Myinstants" property="og:title"><button class="instant" id="instant-page-button" onclick="throw 1;play('/media/sounds/working-cat.mp3')">Play</button>`;
const error=code=>value=>value?.code===code;
const request=(url=page,signal)=>new Request(`https://zapstick.example/api/audio?url=${encodeURIComponent(url)}`,{signal});

test('only exact HTTPS MyInstants hosts and known page/media paths are accepted',()=>{
 for(const value of ['https://myinstants.com/instant/chat/','https://www.myinstants.com/pt-br/instant/chat/','https://www.myinstants.com:443/media/sounds/chat.mp3'])assert.ok(validateMyInstantsUrl(value));
 assert.equal(validateMyInstantsUrl(`${page}?tracking=private#fragment`).url.href,page);
 for(const value of ['http://myinstants.com/instant/chat/','https://myinstants.com.evil.test/instant/chat/','https://evil.test/media/sounds/chat.mp3','https://myinstants.com:8443/instant/chat/','https://user:pass@myinstants.com/instant/chat/','https://myinstants.com@127.0.0.1/instant/chat/','https://127.0.0.1/media/sounds/chat.mp3','https://www.myinstants.com./instant/chat/','https://myinstants.com/random/proxy','https://myinstants.com/media/sounds/folder%2fchat.mp3','https://myinstants.com/media/sounds/%00chat.mp3','https://myinstants.com\\@evil.test/instant/chat/'])assert.throws(()=>validateMyInstantsUrl(value),error('invalid_url'),value);
});
test('static MyInstants attributes resolve without executing handler code, in either attribute order',()=>{
 const result=extractMyInstantsAudio(markup,new URL(page));assert.equal(result.source.url.href,media);assert.equal(result.name,'Café & chat');
 const fromData=extractMyInstantsAudio(`<button data-url="/media/sounds/a.mp3" id="instant-page-button-element"></button>`,new URL(page));assert.equal(fromData.source.url.pathname,'/media/sounds/a.mp3');
 const fromDownload=extractMyInstantsAudio(`<a download href='/media/sounds/a.mp3'>Download</a>`,new URL(page));assert.equal(fromDownload.source.kind,'audio');
 assert.throws(()=>extractMyInstantsAudio(`<button id="instant-page-button" data-url="https://evil.test/media/sounds/a.mp3"></button>`,new URL(page)),error('invalid_url'));
 assert.throws(()=>extractMyInstantsAudio('<script>document.write("nothing")</script>',new URL(page)),error('not_audio'));
});
test('page imports fetch only validated audio, preserve a clean name and omit cookies, cache and redirects',async()=>{
 const calls=[];const result=await importMyInstantsAudio(page,{fetcher:async(url,options)=>{calls.push({url,options});return calls.length===1?html(markup):sound();}});
 assert.equal(result.mime,'audio/mpeg');assert.equal(result.name,'Café & chat');assert.deepEqual([...result.bytes],[...mp3()]);assert.deepEqual(calls.map(call=>call.url),[page,media]);
 for(const call of calls){assert.equal(call.options.redirect,'manual');assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');assert.equal(call.options.referrerPolicy,'no-referrer');}
});
test('every redirect is checked before another fetch and the two-redirect limit covers both downloads together',async()=>{
 let calls=0;await assert.rejects(importMyInstantsAudio(media,{fetcher:async()=>{calls++;return new Response(null,{status:302,headers:{Location:'https://evil.test/media/sounds/a.mp3'}});}}),error('invalid_url'));assert.equal(calls,1);
 const responses=[new Response(null,{status:301,headers:{Location:page.replace('www.','')}}),html(markup),new Response(null,{status:302,headers:{Location:media.replace('working-cat','copy')}}),sound()];
 const result=await importMyInstantsAudio(page,{fetcher:async()=>responses.shift()});assert.equal(result.mime,'audio/mpeg');assert.equal(responses.length,0);
 let index=0;const tooMany=[new Response(null,{status:301,headers:{Location:page.replace('www.','')}}),html(markup),new Response(null,{status:302,headers:{Location:media.replace('working-cat','copy')}}),new Response(null,{status:302,headers:{Location:media}})];
 await assert.rejects(importMyInstantsAudio(page,{fetcher:async()=>tooMany[index++]}),error('unavailable'));assert.equal(index,4);
 let second=0;await assert.rejects(importMyInstantsAudio(page,{fetcher:async()=>++second===1?html(markup):new Response(null,{status:307,headers:{Location:'https://localhost/media/sounds/a.mp3'}})}),error('invalid_url'));assert.equal(second,2);
});
test('media signatures reject HTML, an ID3 label alone, and misleading content types',async()=>{
 assert.equal(sniffAudio(mp3()),'audio/mpeg');assert.equal(sniffAudio(new TextEncoder().encode('<html><script>not audio</script></html>')),null);
 assert.equal(sniffAudio(new TextEncoder().encode('ID3\x04\x00\x00\x00\x00\x00\x00a fake tag without frames')),null);
 const id3=new Uint8Array(10+mp3().length);id3.set([73,68,51,4,0,0,0,0,0,0]);id3.set(mp3(),10);assert.equal(sniffAudio(id3),'audio/mpeg');
 await assert.rejects(importMyInstantsAudio(media,{fetcher:async()=>new Response('<html>challenge</html>',{headers:{'Content-Type':'audio/mpeg'}})}),error('not_audio'));
 await assert.rejects(importMyInstantsAudio(media,{fetcher:async()=>new Response(mp3(),{headers:{'Content-Type':'text/html'}})}),error('not_audio'));
 assert.equal((await importMyInstantsAudio(media,{fetcher:async()=>sound({'Content-Type':'application/octet-stream'})})).mime,'audio/mpeg');
});
test('WAV and Ogg need audio structure, and MP4 must have a sound handler without video',()=>{
 const wav=new Uint8Array(52),view=new DataView(wav.buffer);wav.set(new TextEncoder().encode('RIFF'),0);view.setUint32(4,44,true);wav.set(new TextEncoder().encode('WAVEfmt '),8);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,8000,true);view.setUint32(28,16000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);wav.set(new TextEncoder().encode('data'),36);view.setUint32(40,8,true);assert.equal(sniffAudio(wav),'audio/wav');view.setUint32(40,5000,true);assert.equal(sniffAudio(wav),null);
 const ogg=new Uint8Array(47);ogg.set(new TextEncoder().encode('OggS'));ogg[26]=1;ogg[27]=19;ogg.set(new TextEncoder().encode('OpusHead'),28);assert.equal(sniffAudio(ogg),'audio/ogg');ogg.set(new TextEncoder().encode('theora  '),28);assert.equal(sniffAudio(ogg),null);
 const box=(type,body)=>{const bytes=new Uint8Array(8+body.length);new DataView(bytes.buffer).setUint32(0,bytes.length);bytes.set(new TextEncoder().encode(type),4);bytes.set(body,8);return bytes;};
 const handler=new Uint8Array(16);handler.set(new TextEncoder().encode('soun'),8);const ftyp=box('ftyp',new TextEncoder().encode('M4A \x00\x00\x00\x00M4A ')),moov=box('moov',box('trak',box('mdia',box('hdlr',handler)))),mdat=box('mdat',new Uint8Array([1,2,3,4]));
 const audio=new Uint8Array(ftyp.length+moov.length+mdat.length);audio.set(ftyp);audio.set(moov,ftyp.length);audio.set(mdat,ftyp.length+moov.length);assert.equal(sniffAudio(audio),'audio/mp4');
 const video=audio.slice();const at=video.findIndex((_,index)=>String.fromCharCode(...video.subarray(index,index+4))==='soun');video.set(new TextEncoder().encode('vide'),at);assert.equal(sniffAudio(video),null);
});
test('HTML and audio lengths are bounded from headers and streamed bytes, with cancellation',async()=>{
 let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});
 await assert.rejects(importMyInstantsAudio(media,{fetcher:async()=>new Response(body,{headers:{'Content-Type':'audio/mpeg','Content-Length':String(AUDIO_IMPORT_LIMITS.audioBytes+1)}})}),error('too_large'));assert.equal(cancelled,true);
 await assert.rejects(importMyInstantsAudio(page,{fetcher:async()=>html('x'.repeat(AUDIO_IMPORT_LIMITS.htmlBytes+1))}),error('too_large'));
 let streamCancelled=false;await assert.rejects(importMyInstantsAudio(media,{fetcher:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(3*1024*1024));controller.enqueue(new Uint8Array(3*1024*1024));},cancel(){streamCancelled=true;}}),{headers:{'Content-Type':'audio/mpeg'}})}),error('too_large'));assert.equal(streamCancelled,true);
});
test('one total timeout covers page plus media and a stalled response body',async()=>{
 let count=0;await assert.rejects(importMyInstantsAudio(page,{timeoutMs:40,fetcher:async()=>{await delay(25);return ++count===1?html(markup):sound();}}),error('timeout'));
 let cancelled=false;await assert.rejects(importMyInstantsAudio(media,{timeoutMs:20,fetcher:async()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{headers:{'Content-Type':'audio/mpeg'}})}),error('timeout'));assert.equal(cancelled,true);
});
test('handler returns canonical bytes/name/no-store and concise JSON errors without upstream details',async()=>{
 const handle=createAudioImportHandler({fetcher:async url=>url.includes('/instant/')?html(markup):sound()});
 const response=await handle(request());assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/mpeg');assert.equal(decodeURIComponent(response.headers.get('x-audio-name')),'Café & chat');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal((await response.arrayBuffer()).byteLength,mp3().length);
 for(const url of ['https://zapstick.example/api/audio','https://zapstick.example/api/audio?url=x&url=y']){const result=await handle(new Request(url));assert.equal(result.status,400);assert.deepEqual(await result.json(),{error:'invalid_url'});}
 const failed=createAudioImportHandler({fetcher:async()=>{throw new Error('private upstream details should not leak');}});const error=await failed(request(media));assert.equal(error.status,502);assert.deepEqual(await error.json(),{error:'unavailable'});
});
test('two downloads run without a queue, client cancellation releases capacity, and busy does no fetch',async()=>{
 const held=[];const handle=createAudioImportHandler({fetcher:()=>new Promise(resolve=>held.push(resolve))}),controller=new AbortController();
 const first=handle(request(media,controller.signal)),second=handle(request(media));assert.equal(held.length,2);
 const busy=await handle(request(media));assert.equal(busy.status,429);assert.deepEqual(await busy.json(),{error:'busy'});assert.equal(held.length,2);
 controller.abort();assert.equal((await first).status,502);
 const next=handle(request(media));assert.equal(held.length,3);held[1](sound());held[2](sound());assert.equal((await second).status,200);assert.equal((await next).status,200);held[0](sound());
});
