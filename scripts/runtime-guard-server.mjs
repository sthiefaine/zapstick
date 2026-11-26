import http from 'node:http';
import {performance} from 'node:perf_hooks';
import {Transform} from 'node:stream';

export const DEFAULT_LIMITS=Object.freeze({
 requestRate:80,requestBurst:160,peerRate:20,peerBurst:80,ssrRate:10,ssrBurst:30,
 maxInflight:64,maxSsrInflight:12,maxConnections:256,maxPeers:4096,peerTtlMs:120_000,
 maxUrlBytes:2048,maxHeaderBytes:8192,maxHeaderCount:48,headersTimeoutMs:5000,
 idleTimeoutMs:10_000,ssrTimeoutMs:15_000,assetTimeoutMs:120_000,keepAliveMs:5000,
 maxRequestsPerSocket:100,healthRate:40,healthBurst:80,
 audioRate:1,audioBurst:4,maxAudioInflight:2,audioTimeoutMs:17_000,
 whatsappRate:4,whatsappBurst:12,maxWhatsappInflight:4,transferRate:0.2,transferBurst:2,
 maxTransferUploads:2,maxTransferBytes:4*1024*1024,transferTimeoutMs:20_000,
});

export class TokenBucket{
 constructor(rate,burst,clock=()=>performance.now()){this.rate=rate;this.burst=burst;this.clock=clock;this.tokens=burst;this.updated=clock();}
 take(){const now=this.clock();this.tokens=Math.min(this.burst,this.tokens+Math.max(0,now-this.updated)*this.rate/1000);this.updated=now;if(this.tokens<1)return false;this.tokens--;return true;}
}

/** Ephemeral socket-peer budgets. New peers are rejected at capacity, never allowed by eviction. */
export class PeerBudgets{
 constructor({rate,burst,maxEntries,ttlMs,clock=()=>performance.now()}){Object.assign(this,{rate,burst,maxEntries,ttlMs,clock});this.entries=new Map();}
 prune(){const cutoff=this.clock()-this.ttlMs;for(const [key,value] of this.entries)if(value.seen<=cutoff)this.entries.delete(key);}
 take(address){let entry=this.entries.get(address);if(!entry){if(this.entries.size>=this.maxEntries)this.prune();if(this.entries.size>=this.maxEntries)return false;entry={bucket:new TokenBucket(this.rate,this.burst,this.clock),seen:0};this.entries.set(address,entry);}entry.seen=this.clock();return entry.bucket.take();}
 clear(){this.entries.clear();}
}

const fixedHopHeaders=['connection','proxy-connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];
const isLoopback=address=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address);
function hopHeaders(headers){return new Set([...fixedHopHeaders,...String(headers.connection??'').split(',').map(value=>value.trim().toLowerCase())]);}
function requestHeaders(request,publicOrigin){
 const blocked=hopHeaders(request.headers),headers={};
 for(const [key,value] of Object.entries(request.headers))if(!blocked.has(key)&&!key.startsWith('x-forwarded-')&&!['forwarded','x-real-ip','true-client-ip','cf-connecting-ip','x-client-ip'].includes(key))headers[key]=value;
 headers.host=publicOrigin?.host??request.headers.host;
 headers['x-forwarded-host']=headers.host;headers['x-forwarded-proto']=publicOrigin?.protocol==='https:'?'https':'http';
 headers['x-forwarded-port']=publicOrigin?.port||(publicOrigin?.protocol==='https:'?'443':'80');
 headers['x-forwarded-for']=request.socket.remoteAddress??'';
 return headers;
}
function responseHeaders(headers){const blocked=hopHeaders(headers),result={};for(const [key,value] of Object.entries(headers))if(!blocked.has(key)&&value!==undefined)result[key]=value;return result;}
function reply(request,response,status,text,extra={}){
 if(response.destroyed||response.writableEnded)return;
 const body=Buffer.from(text+'\n');response.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Connection':'close',...extra});
 response.once('finish',()=>request.socket.destroy());response.end(request.method==='HEAD'?undefined:body);
}
function audioReply(request,response,status,error,extra={}){
 if(response.destroyed||response.writableEnded)return;
 const body=Buffer.from(JSON.stringify({error}));response.writeHead(status,{'Content-Type':'application/json','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Connection':'close',...extra});
 response.once('finish',()=>request.socket.destroy());response.end(request.method==='HEAD'?undefined:body);
}
function configuredOrigin(candidate){try{const url=new URL(candidate);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url:undefined;}catch{return undefined;}}
function targetsApi(pathname){
 let value=pathname;
 for(let pass=0;pass<8;pass++){
  if(value==='/api'||value.startsWith('/api/'))return true;
  // Next may resolve dot segments or decode path components before routing.
  // Treat those aliases as API requests before selecting an admission budget.
  const parts=[];for(const part of value.replace(/\\/g,'/').split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}
  const normal='/'+parts.join('/');if(normal==='/api'||normal.startsWith('/api/'))return true;
  let next;try{next=decodeURIComponent(value);}catch{return false;}
  if(next===value)return false;value=next;
 }
 return false;
}

/** Built-in HTTP proxy: all expensive work stays behind admission checks. No IP/request logging. */
export function createRuntimeGuard({upstreamPort,staticPaths=new Set(),isHealthy=()=>true,limits:custom={},publicUrl,clock=()=>performance.now()}={}){
 const limits={...DEFAULT_LIMITS,...custom};
 for(const [key,value] of Object.entries(limits))if(!Number.isFinite(value)||value<=0)throw new Error(`Invalid guard limit: ${key}`);
 if(!Number.isInteger(upstreamPort)||upstreamPort<1||upstreamPort>65535)throw new Error('Invalid private upstream port.');
 const globalBudget=new TokenBucket(limits.requestRate,limits.requestBurst,clock),ssrBudget=new TokenBucket(limits.ssrRate,limits.ssrBurst,clock),healthBudget=new TokenBucket(limits.healthRate,limits.healthBurst,clock),audioBudget=new TokenBucket(limits.audioRate,limits.audioBurst,clock),whatsappBudget=new TokenBucket(limits.whatsappRate,limits.whatsappBurst,clock),transferBudget=new TokenBucket(limits.transferRate,limits.transferBurst,clock);
 const peers=new PeerBudgets({rate:limits.peerRate,burst:limits.peerBurst,maxEntries:limits.maxPeers,ttlMs:limits.peerTtlMs,clock});
 const sockets=new Set(),publicOrigin=configuredOrigin(publicUrl),agent=new http.Agent({keepAlive:true,maxSockets:limits.maxInflight,maxTotalSockets:limits.maxInflight,maxFreeSockets:8,timeout:limits.idleTimeoutMs});
 let inflight=0,ssrInflight=0,audioInflight=0,whatsappInflight=0,transferUploads=0,publicSockets=0,closing=false;
 const server=http.createServer({maxHeaderSize:limits.maxHeaderBytes,headersTimeout:limits.headersTimeoutMs,requestTimeout:Math.max(limits.headersTimeoutMs,limits.transferTimeoutMs),connectionsCheckingInterval:Math.min(1000,limits.headersTimeoutMs)},(request,response)=>{
  const url=request.url??'',method=request.method??'';
  const transferCollection=url==='/api/whatsapp/transfers',transferItem=/^\/api\/whatsapp\/transfers\/[A-Za-z0-9_-]{22}$/.test(url),whatsappStatus=url==='/api/whatsapp/status',whatsapp=transferCollection||transferItem||whatsappStatus;
  const upload=transferCollection&&method==='POST',allowed=transferCollection?['POST']:transferItem?['GET','DELETE']:whatsappStatus?['GET']:['GET','HEAD','OPTIONS'];
  if(closing){reply(request,response,503,'Service unavailable.');return;}
  if(Buffer.byteLength(url)>limits.maxUrlBytes){reply(request,response,414,'URI too long.');return;}
  if(!url.startsWith('/')||url.startsWith('//')||/[\\\x00-\x20\x7f]/.test(url)){reply(request,response,400,'Invalid request target.');return;}
  if(request.rawHeaders.length/2>limits.maxHeaderCount){reply(request,response,431,'Too many headers.');return;}
  if(!allowed.includes(method)){reply(request,response,405,'Method not allowed.',{Allow:allowed.join(', ')});return;}
  if(!upload&&(request.headers['transfer-encoding']!==undefined||(request.headers['content-length']!==undefined&&request.headers['content-length']!=='0'))){reply(request,response,413,'Request bodies are not accepted.');return;}
  if(upload){
   const length=request.headers['content-length'];
   if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>limits.maxTransferBytes)){audioReply(request,response,413,'too_large');return;}
   if(!/^multipart\/form-data;\s*boundary=(?:"[\w'()+,./:=? -]{1,70}"|[\w'()+,./:=?-]{1,70})$/i.test(String(request.headers['content-type']??''))){audioReply(request,response,415,'invalid');return;}
  }
  if(!request.headers.host||request.rawHeaders.filter((_,index)=>index%2===0&&request.rawHeaders[index].toLowerCase()==='host').length!==1){reply(request,response,400,'Invalid host.');return;}
  // An exact, constant-size health reply never consumes a Next render slot.
  if(url==='/api/health'){
   const local=isLoopback(request.socket.remoteAddress);
   if(!local&&!healthBudget.take()){reply(request,response,429,'Too many requests.',{'Retry-After':'1'});return;}
   const ok=isHealthy(),body=Buffer.from(JSON.stringify({status:ok?'ok':'starting',service:'zapstick'}));
   response.writeHead(ok?200:503,{'Content-Type':'application/json','Content-Length':body.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});response.end(method==='HEAD'?undefined:body);return;
  }
  const address=request.socket.remoteAddress??'unknown',pathname=url.split('?',1)[0],audio=pathname==='/api/audio',asset=!audio&&!whatsapp&&staticPaths.has(pathname),audioWork=audio&&method==='GET';
  try{decodeURIComponent(pathname);}catch{reply(request,response,400,'Invalid request target.');return;}
  if(targetsApi(pathname)&&!audio&&!whatsapp){reply(request,response,404,'Not found.');return;}
  if(audio&&method==='HEAD'){audioReply(request,response,405,'unavailable',{Allow:'GET'});return;}
  if(!peers.take(address)||!globalBudget.take()||(!asset&&!ssrBudget.take())||inflight>=limits.maxInflight||(!asset&&ssrInflight>=limits.maxSsrInflight)||(audioWork&&(!audioBudget.take()||audioInflight>=limits.maxAudioInflight))||(whatsapp&&(!whatsappBudget.take()||whatsappInflight>=limits.maxWhatsappInflight))||(upload&&(!transferBudget.take()||transferUploads>=limits.maxTransferUploads))){
   if(audio||whatsapp)audioReply(request,response,429,'busy',{'Retry-After':whatsapp?'5':'1'});else reply(request,response,429,'Too many requests.',{'Retry-After':'1'});return;
  }
  if(method==='OPTIONS'){response.writeHead(204,{Allow:'GET, HEAD, OPTIONS','Cache-Control':'no-store'});response.end();return;}
  if(!isHealthy()){reply(request,response,503,'Service unavailable.',{'Retry-After':'1'});return;}
  inflight++;if(!asset)ssrInflight++;if(audioWork)audioInflight++;if(whatsapp)whatsappInflight++;if(upload)transferUploads++;
  request.socket.setTimeout(upload?limits.transferTimeoutMs:audioWork?limits.audioTimeoutMs:limits.idleTimeoutMs);
  let finished=false,upstream,bodyLimiter,bodyRejected=false;
  const timer=setTimeout(()=>{bodyRejected=true;upstream?.destroy();if(response.headersSent)response.destroy();else if(audioWork||whatsapp)audioReply(request,response,504,'timeout');else reply(request,response,504,'Upstream timeout.');},upload?limits.transferTimeoutMs:audioWork?limits.audioTimeoutMs:asset?limits.assetTimeoutMs:limits.ssrTimeoutMs);timer.unref();
  const done=()=>{if(finished)return;finished=true;clearTimeout(timer);inflight--;if(!asset)ssrInflight--;if(audioWork)audioInflight--;if(whatsapp)whatsappInflight--;if(upload)transferUploads--;if(bodyLimiter){request.unpipe(bodyLimiter);bodyLimiter.destroy();}if(!response.writableFinished||upload&&!request.complete)upstream?.destroy();};
  response.once('finish',done);response.once('close',done);
  upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:url,method,headers:requestHeaders(request,publicOrigin),agent},incoming=>{
   response.writeHead(incoming.statusCode??502,responseHeaders(incoming.headers));incoming.on('error',()=>response.destroy());incoming.pipe(response);
  });
  upstream.setTimeout(upload?limits.transferTimeoutMs:audioWork?limits.audioTimeoutMs:limits.idleTimeoutMs,()=>upstream.destroy(new Error('Upstream inactivity.')));
  upstream.on('error',()=>{if(bodyRejected)return;if(response.headersSent)response.destroy();else if(audioWork||whatsapp)audioReply(request,response,502,'unavailable');else reply(request,response,502,'Upstream unavailable.');});
  request.once('aborted',()=>upstream.destroy());
  if(upload){
   let bytes=0;
   bodyLimiter=new Transform({transform(chunk,_encoding,callback){bytes+=chunk.length;if(bytes>limits.maxTransferBytes){bodyRejected=true;audioReply(request,response,413,'too_large');upstream.destroy();callback(new Error('Transfer too large.'));}else callback(null,chunk);}});
   bodyLimiter.on('error',()=>{upstream.destroy();});request.pipe(bodyLimiter).pipe(upstream);
  }else upstream.end();
 });
 // Preserve all pairs for the explicit count check; parser bytes remain capped at 8 KiB.
 server.maxHeadersCount=0;server.keepAliveTimeout=limits.keepAliveMs;server.maxRequestsPerSocket=limits.maxRequestsPerSocket;
 server.maxConnections=limits.maxConnections;server.setTimeout(limits.idleTimeoutMs,socket=>socket.destroy());
 const publicSocketLimit=Math.max(1,limits.maxConnections-Math.min(8,Math.max(1,Math.floor(limits.maxConnections/8))));
 server.on('connection',socket=>{
  const external=!isLoopback(socket.remoteAddress);
  if(external&&publicSockets>=publicSocketLimit){socket.destroy();return;}
  if(external)publicSockets++;sockets.add(socket);socket.once('close',()=>{sockets.delete(socket);if(external)publicSockets--;});
 });
 const refuseSocket=(socket,status='405 Method Not Allowed')=>{if(socket.writable)socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);else socket.destroy();};
 server.on('connect',(_request,socket)=>refuseSocket(socket));server.on('upgrade',(_request,socket)=>refuseSocket(socket));
 server.on('checkContinue',(request,response)=>reply(request,response,417,'Expectation failed.'));
 server.on('checkExpectation',(request,response)=>reply(request,response,417,'Expectation failed.'));
 server.on('clientError',(error,socket)=>refuseSocket(socket,error.code==='HPE_HEADER_OVERFLOW'?'431 Request Header Fields Too Large':['HPE_HEADER_TIMEOUT','ERR_HTTP_REQUEST_TIMEOUT'].includes(error.code)?'408 Request Timeout':'400 Bad Request'));
 const cleanup=setInterval(()=>peers.prune(),Math.min(30_000,limits.peerTtlMs));cleanup.unref();
 let stopPromise;
 return {server,limits,
  snapshot:()=>({inflight,ssrInflight,audioInflight,whatsappInflight,transferUploads,peerEntries:peers.entries.size,sockets:sockets.size,publicSockets}),
  close(graceMs=5000){if(stopPromise)return stopPromise;closing=true;clearInterval(cleanup);stopPromise=new Promise(resolve=>{const force=setTimeout(()=>{for(const socket of sockets)socket.destroy();agent.destroy();resolve();},graceMs);force.unref();server.close(()=>{clearTimeout(force);agent.destroy();peers.clear();resolve();});server.closeIdleConnections();});return stopPromise;},
 };
}
