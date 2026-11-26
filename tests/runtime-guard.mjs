import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createRuntimeGuard,TokenBucket,PeerBudgets} from '../scripts/runtime-guard-server.mjs';
import {startGuardedRuntime} from '../scripts/runtime-guard.mjs';

const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const request=(port,path='/',{method='GET',headers={},body}={})=>new Promise((resolve,reject)=>{const outgoing=http.request({host:'127.0.0.1',port,path,method,headers,agent:false},response=>{let data='';response.on('data',chunk=>data+=chunk);response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:data}));});outgoing.on('error',reject);outgoing.end(body);});
const raw=(port,data)=>new Promise((resolve,reject)=>{const socket=net.connect(port,'127.0.0.1');let output='';socket.setTimeout(1500,()=>{socket.destroy();reject(new Error('Raw request did not terminate.'));});socket.on('connect',()=>socket.write(data));socket.on('data',chunk=>output+=chunk);socket.on('error',reject);socket.on('close',()=>resolve(output));});
async function setup(t,handler,options={}){const backend=http.createServer(handler),upstreamPort=await listen(backend),guard=createRuntimeGuard({upstreamPort,...options}),port=await listen(guard.server);t.after(async()=>{await guard.close(100);backend.closeAllConnections();await new Promise(resolve=>backend.close(resolve));});return {port,guard};}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await delay(5);}throw new Error('Condition not reached.');}
const roomy={requestRate:1000,requestBurst:1000,peerRate:1000,peerBurst:1000,ssrRate:1000,ssrBurst:1000};

test('token refill is monotonic and peer state is capped and expires',()=>{
 let now=0;const clock=()=>now,bucket=new TokenBucket(2,2,clock);assert.ok(bucket.take());assert.ok(bucket.take());assert.equal(bucket.take(),false);now=500;assert.ok(bucket.take());assert.equal(bucket.take(),false);
 const peers=new PeerBudgets({rate:1,burst:2,maxEntries:2,ttlMs:1000,clock});assert.ok(peers.take('a'));assert.ok(peers.take('b'));assert.equal(peers.take('c'),false);assert.equal(peers.entries.size,2);now=1501;assert.ok(peers.take('c'));assert.equal(peers.entries.size,1);peers.clear();assert.equal(peers.entries.size,0);
});
test('a normal forty-asset startup burst passes and immutable caching is preserved',async t=>{
 let reached=0;const {port}=await setup(t,(_request,response)=>{reached++;response.writeHead(200,{'Cache-Control':'public, max-age=31536000, immutable'});response.end('asset');},{staticPaths:new Set(['/asset.js'])});
 const replies=await Promise.all(Array.from({length:40},(_,index)=>request(port,`/asset.js?v=${index}`)));assert.ok(replies.every(value=>value.status===200));assert.ok(replies.every(value=>value.headers['cache-control'].includes('immutable')));assert.equal(reached,40);
 assert.equal((await request(port,'/fr')).status,200);
});
test('forged forwarded and Cloudflare IP headers cannot rotate the socket-peer budget',async t=>{
 const observed=[];const {port,guard}=await setup(t,(req,res)=>{observed.push(req.headers);res.end('ok');},{clock:()=>0,publicUrl:'https://stickers.example.com',limits:{...roomy,peerRate:1,peerBurst:2}});
 const statuses=[];for(let i=0;i<4;i++)statuses.push((await request(port,'/fr',{headers:{'X-Forwarded-For':`198.51.100.${i}`,'CF-Connecting-IP':`203.0.113.${i}`,'X-Real-IP':'spoofed','X-Forwarded-Proto':'http'}})).status);
 assert.deepEqual(statuses,[200,200,429,429]);assert.equal(guard.snapshot().peerEntries,1);assert.equal(observed[0]['x-forwarded-for'],'127.0.0.1');assert.equal(observed[0]['cf-connecting-ip'],undefined);assert.equal(observed[0]['x-real-ip'],undefined);assert.equal(observed[0]['x-forwarded-proto'],'https');
});
test('SSR is budgeted before forwarding, fake static paths do not bypass it, and health stays independent',async t=>{
 let reached=0;const {port}=await setup(t,(_req,res)=>{reached++;res.end('ok');},{clock:()=>0,staticPaths:new Set(['/real.js']),limits:{...roomy,ssrBurst:2,ssrRate:1}});
 assert.equal((await request(port,'/fr')).status,200);assert.equal((await request(port,'/en')).status,200);
 const blocked=await request(port,'/_next/static/nonexistent.js');assert.equal(blocked.status,429);assert.equal(blocked.headers['retry-after'],'1');assert.equal((await request(port,'/real.js')).status,200);
 assert.equal((await request(port,'/api/health')).status,200);assert.equal(reached,3);
});
test('URL, header, method, body, Expect and upgrade limits reject before Next',async t=>{
 let reached=0;const {port}=await setup(t,(_req,res)=>{reached++;res.end('ok');},{limits:roomy});
 assert.equal((await request(port,'/fr',{method:'POST',body:'not an upload'})).status,405);
 assert.equal((await request(port,'/fr',{headers:{'Content-Length':'1'},body:'x'})).status,413);
 assert.equal((await request(port,'/'+ 'x'.repeat(2100))).status,414);
 assert.equal((await request(port,'/',{headers:{'X-Large':'x'.repeat(9000)}})).status,431);
 const many=Object.fromEntries(Array.from({length:60},(_,i)=>[`X-${i}`,'1']));assert.equal((await request(port,'/',{headers:many})).status,431);
 assert.match(await raw(port,'GET / HTTP/1.1\r\nHost: localhost\r\nExpect: 100-continue\r\nContent-Length: 1\r\n\r\n'),/^HTTP\/1\.1 417/);
 assert.match(await raw(port,'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'),/^HTTP\/1\.1 405/);
 assert.equal((await request(port,'/fr',{method:'OPTIONS'})).status,204);assert.equal(reached,0);
});
test('in-flight work has no queue; health remains available while SSR and asset slots are occupied',async t=>{
 const held=[];const {port,guard}=await setup(t,(_req,res)=>held.push(res),{staticPaths:new Set(['/asset.js']),limits:{...roomy,maxInflight:2,maxSsrInflight:1}});
 const first=request(port,'/fr');await until(()=>held.length===1);assert.equal((await request(port,'/en')).status,429);
 const second=request(port,'/asset.js');await until(()=>held.length===2);assert.equal((await request(port,'/asset.js')).status,429);assert.equal((await request(port,'/api/health')).status,200);
 for(const response of held)response.end('ok');assert.equal((await first).status,200);assert.equal((await second).status,200);await until(()=>guard.snapshot().inflight===0);assert.equal(guard.snapshot().ssrInflight,0);
});
test('a stalled upstream and incomplete incoming headers are closed within bounded time',async t=>{
 const {port}=await setup(t,()=>{}, {limits:{...roomy,ssrTimeoutMs:60,headersTimeoutMs:100,idleTimeoutMs:1000}});
 assert.equal((await request(port,'/fr')).status,504);
 const start=Date.now(),response=await raw(port,'GET / HTTP/1.1\r\nHost: localhost\r\nX-Slow: ');assert.match(response,/^HTTP\/1\.1 (?:400|408)/);assert.ok(Date.now()-start<1200);
});
test('connection admission reserves loopback health capacity when external slots are occupied',async t=>{
 const {port,guard}=await setup(t,(_req,res)=>res.end('ok'),{limits:{...roomy,maxConnections:8}});
 // macOS does not bind arbitrary 127/8 aliases. Exercise the admission callback
 // with synthetic external peers; the health request still uses a real socket.
 class Socket extends EventEmitter{remoteAddress='203.0.113.1';destroy(){this.destroyed=true;this.emit('close');}}
 const accept=guard.server.listeners('connection').at(-1),sockets=Array.from({length:8},()=>new Socket());
 for(const socket of sockets)accept(socket);assert.equal(guard.snapshot().publicSockets,7);assert.equal(sockets[7].destroyed,true);
 assert.equal((await request(port,'/api/health')).status,200);for(const socket of sockets.slice(0,7))socket.destroy();
});
test('guarded startup binds Next privately and shutdown forwards the child signal without an orphan',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'zapstick-guard-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await mkdir(join(directory,'public'));await writeFile(join(directory,'public','asset.txt'),'asset');await writeFile(join(directory,'public','chunk [locale].js'),'asset');
 await writeFile(join(directory,'server.js'),`const http=require('node:http'),fs=require('node:fs');const server=http.createServer((req,res)=>{if(req.url==='/api/health'){res.end('ok');return;}res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.end('fixture');});server.listen(Number(process.env.PORT),process.env.HOSTNAME);process.on('SIGTERM',()=>{fs.writeFileSync('stopped.txt','SIGTERM');server.close(()=>process.exit(0));});`);
 const runtime=await startGuardedRuntime({directory,port:0,hostname:'127.0.0.1',shutdownMs:200,startupMs:3000,env:{...process.env,SITE_URL:'http://localhost'}});t.after(()=>runtime.close());
 assert.notEqual(runtime.port,runtime.internalPort);assert.equal((await request(runtime.port,'/fr')).status,200);assert.equal((await request(runtime.port,'/api/health')).status,200);
 for(let index=0;index<31;index++)assert.equal((await request(runtime.port,'/chunk%20%5Blocale%5D.js')).status,200);
 await runtime.close();assert.equal(await readFile(join(directory,'stopped.txt'),'utf8'),'SIGTERM');assert.equal((await runtime.exited).code,0);assert.throws(()=>process.kill(runtime.child.pid,0));
});
test('only the exact audio GET endpoint is forwarded, preserving its binary response and no-store headers',async t=>{
 let reached=0;const {port}=await setup(t,(_req,res)=>{reached++;res.writeHead(200,{'Content-Type':'audio/mpeg','X-Audio-Name':'Caf%C3%A9','Cache-Control':'no-store'});res.end('audio bytes');},{limits:roomy});
 const response=await request(port,'/api/audio?url=https%3A%2F%2Fwww.myinstants.com%2Fmedia%2Fsounds%2Ftest.mp3');
 assert.equal(response.status,200);assert.equal(response.headers['content-type'],'audio/mpeg');assert.equal(response.headers['x-audio-name'],'Caf%C3%A9');assert.equal(response.headers['cache-control'],'no-store');
 assert.equal((await request(port,'/api/audio?url=x',{method:'HEAD'})).status,405);
 for(const path of ['/api/anything','/api/audio/','/api%2faudio','/foo/../api/audio','/foo/%2e%2e/api/audio','/%61pi/audio','/%2fapi/audio','/foo%2f..%2fapi%2faudio','/foo/%252e%252e%252fapi%252faudio','/foo/%5c..%5capi%5caudio'])assert.equal((await request(port,path)).status,404,path);
 assert.equal(reached,1);
});
test('audio imports have their own rate and concurrency budgets while remaining inside SSR admission',async t=>{
 const held=[];const {port,guard}=await setup(t,(_req,res)=>{held.push(res);},{clock:()=>0,limits:{...roomy,audioBurst:4,maxAudioInflight:1,maxSsrInflight:2}});
 const first=request(port,'/api/audio?url=x');await until(()=>held.length===1);assert.equal(guard.snapshot().audioInflight,1);assert.equal(guard.snapshot().ssrInflight,1);
 const blocked=await request(port,'/api/audio?url=y');assert.equal(blocked.status,429);assert.deepEqual(JSON.parse(blocked.body),{error:'busy'});assert.equal(blocked.headers['cache-control'],'no-store');
 const page=request(port,'/fr');await until(()=>held.length===2);assert.equal((await request(port,'/en')).status,429);assert.equal((await request(port,'/api/health')).status,200);
 for(const res of held)res.end('ok');assert.equal((await first).status,200);assert.equal((await page).status,200);await until(()=>guard.snapshot().audioInflight===0);
});
test('audio-rate exhaustion cannot be bypassed with forged peers or static classification',async t=>{
 let reached=0;const {port}=await setup(t,(_req,res)=>{reached++;res.end('ok');},{clock:()=>0,staticPaths:new Set(['/api/audio']),limits:{...roomy,audioRate:1,audioBurst:1}});
 assert.equal((await request(port,'/api/audio?url=x')).status,200);
 const denied=await request(port,'/api/audio?url=y',{headers:{'X-Forwarded-For':'198.51.100.40'}});assert.equal(denied.status,429);assert.deepEqual(JSON.parse(denied.body),{error:'busy'});
 assert.equal((await request(port,'/fr')).status,200);assert.equal((await request(port,'/api/health')).status,200);assert.equal(reached,2);
});
test('audio has a bounded dedicated wait instead of the shorter ordinary SSR and socket-idle timers',async t=>{
 const {port}=await setup(t,(_req,res)=>{setTimeout(()=>res.end('audio'),70);},{limits:{...roomy,ssrTimeoutMs:20,idleTimeoutMs:30,audioTimeoutMs:180}});
 assert.equal((await request(port,'/api/audio?url=x')).status,200);
 const stalled=await setup(t,()=>{}, {limits:{...roomy,idleTimeoutMs:500,audioTimeoutMs:50}});
 const timed=await request(stalled.port,'/api/audio?url=x');assert.equal(timed.status,504);assert.deepEqual(JSON.parse(timed.body),{error:'timeout'});
});
test('client disconnection aborts private audio work and releases both audio and SSR slots',async t=>{
 let reached=0,closed=false;const {port,guard}=await setup(t,(_req,res)=>{reached++;if(reached===1)res.on('close',()=>{closed=true;});else res.end('ok');},{limits:{...roomy,maxAudioInflight:1}});
 const outgoing=http.get({host:'127.0.0.1',port,path:'/api/audio?url=x',agent:false});outgoing.on('error',()=>{});
 await until(()=>reached===1);assert.equal(guard.snapshot().audioInflight,1);outgoing.destroy();
 await until(()=>closed&&guard.snapshot().audioInflight===0);assert.equal(guard.snapshot().ssrInflight,0);assert.equal((await request(port,'/api/audio?url=y')).status,200);
});

test('WhatsApp accepts only canonical upload, status and receipt routes and streams a chunked body',async t=>{
 const seen=[];const {port}=await setup(t,(req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{seen.push({path:req.url,method:req.method,body});res.end('ok');});},{limits:{...roomy,whatsappBurst:30,transferBurst:10}});
 const id='a'.repeat(22),headers={'Content-Type':'multipart/form-data; boundary=test'};
 assert.equal((await request(port,'/api/whatsapp/transfers',{method:'POST',headers,body:'a body'})).status,200);
 const chunked=await raw(port,'POST /api/whatsapp/transfers HTTP/1.1\r\nHost: localhost\r\nContent-Type: multipart/form-data; boundary=test\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n');assert.match(chunked,/^HTTP\/1\.1 200/);
 assert.equal((await request(port,'/api/whatsapp/status')).status,200);
 assert.equal((await request(port,'/api/whatsapp/transfers/'+id)).status,200);
 assert.equal((await request(port,'/api/whatsapp/transfers/'+id,{method:'DELETE'})).status,200);
 for(const path of ['/api/whatsapp/transfers/','/api/whatsapp/status?x=1','/api/whatsapp/transfers/'+id+'?x=1','/api/%77hatsapp/status','/api/whatsapp/transfers/'+id+'extra','/other/../api/whatsapp/status'])assert.equal((await request(port,path)).status,404,path);
 assert.equal((await request(port,'/api/whatsapp/transfers/'+id,{method:'POST',headers,body:'x'})).status,405);
 assert.equal(seen.length,5);assert.equal(seen[0].body,'a body');assert.equal(seen[1].body,'abcde');
});
test('WhatsApp bounds declared and chunked uploads before downstream completion',async t=>{
 let completed=0;const {port,guard}=await setup(t,(req,res)=>{req.on('data',()=>{});req.on('end',()=>{completed++;res.end('ok');});},{limits:{...roomy,maxTransferBytes:8,transferBurst:10}});
 const headers={'Content-Type':'multipart/form-data; boundary=test','Content-Length':'9'};
 assert.equal((await request(port,'/api/whatsapp/transfers',{method:'POST',headers,body:'123456789'})).status,413);
 const chunked=await raw(port,'POST /api/whatsapp/transfers HTTP/1.1\r\nHost: localhost\r\nContent-Type: multipart/form-data; boundary=test\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n5\r\n12345\r\n4\r\n6789\r\n0\r\n\r\n');assert.match(chunked,/^HTTP\/1\.1 413/);
 await until(()=>guard.snapshot().transferUploads===0);assert.equal(completed,0);
 assert.equal((await request(port,'/fr',{method:'POST',headers,body:'123456789'})).status,405);
 assert.equal((await request(port,'/api/whatsapp/transfers',{method:'POST',body:'x'})).status,415);
});
test('WhatsApp upload slots and timeout cannot consume health or remain after client disconnection',async t=>{
 let reached=0;const {port,guard}=await setup(t,(req,res)=>{reached++;if(req.url==='/fr')res.end('page');},{limits:{...roomy,transferBurst:20,maxTransferUploads:1,transferTimeoutMs:100,maxSsrInflight:4}});
 const headers={'Content-Type':'multipart/form-data; boundary=test'};
 const first=request(port,'/api/whatsapp/transfers',{method:'POST',headers,body:'part'});await until(()=>reached===1);
 assert.equal((await request(port,'/api/whatsapp/transfers',{method:'POST',headers,body:'part'})).status,429);
 assert.equal((await request(port,'/api/health')).status,200);assert.equal((await request(port,'/fr')).status,200);
 assert.equal((await first).status,504);await until(()=>guard.snapshot().transferUploads===0);
 const outgoing=http.request({host:'127.0.0.1',port,path:'/api/whatsapp/transfers',method:'POST',headers,agent:false});outgoing.on('error',()=>{});outgoing.write('partial');await until(()=>guard.snapshot().transferUploads===1);outgoing.destroy();
 await until(()=>guard.snapshot().transferUploads===0);assert.equal(guard.snapshot().whatsappInflight,0);
});
