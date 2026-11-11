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
