import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../lib/server/whatsapp-bridge.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};new Function('exports','module',source)(module.exports,module);
const {createWhatsAppBridgeHandler}=module.exports;
const id='abcdefghijklmnopqrstuv',code='ABCDEFGHIJKLMNOPQRSTUV',receipt='a'.repeat(43);
const environment={WHATSAPP_BRIDGE_ENABLED:'true',WHATSAPP_SOUND_ENABLED:'true',WHATSAPP_BRIDGE_TOKEN:'s'.repeat(43),WHATSAPP_BRIDGE_URL:'http://bridge:3210',SITE_URL:'https://zapstick.example'};
const result={id,state:'awaiting_message',expiresAt:Date.now()+600000,claimCode:code,waUrl:'https://wa.me/33612345678?text='+encodeURIComponent('ZAP '+code)};
function request(method='GET',path='/api/whatsapp/transfers/'+id,options={}){return new Request('https://zapstick.example'+path,{method,headers:{Origin:environment.SITE_URL,Authorization:'Bearer '+receipt,...options.headers},...options});}
function form(){const body=new FormData();body.append('manifest',JSON.stringify({version:1,id,locale:'fr'}));body.append('visual',new Blob(['webp'],{type:'image/webp'}),'visual.webp');return body;}

test('bridge disabled is invisible and never contacts the private service',async()=>{
 const handler=createWhatsAppBridgeHandler({env:()=>({}),fetchImpl:()=>{throw new Error('Unexpected network');}});
 const response=await handler(request('GET','/api/whatsapp/status'));
 assert.deepEqual(await response.json(),{enabled:false,ready:false,soundEnabled:false});
 assert.equal((await handler(request())).status,503);
});
test('same-origin upload preserves payload and only forwards explicit internal credentials',async()=>{
 let observed;
 const handler=createWhatsAppBridgeHandler({env:()=>environment,fetchImpl:async(url,init)=>{observed={url,init,form:await new Request(url,{method:init.method,headers:init.headers,body:init.body}).formData()};return Response.json(result,{status:201});}});
 const response=await handler(request('POST','/api/whatsapp/transfers',{body:form()}));
 assert.equal(response.status,201);assert.deepEqual(await response.json(),result);
 assert.equal(observed.url.href,'http://bridge:3210/internal/v1/transfers');
 assert.equal(observed.init.headers.Authorization,'Bearer '+environment.WHATSAPP_BRIDGE_TOKEN);
 assert.equal(observed.init.headers['X-Transfer-Receipt'],receipt);assert.equal(observed.init.redirect,'error');
 assert.equal(await observed.form.get('visual').text(),'webp');
 assert.equal(observed.init.headers.Origin,undefined);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('cross-origin, missing receipts, unexpected methods and aliases fail before private fetch',async()=>{
 let reached=0;const handler=createWhatsAppBridgeHandler({env:()=>environment,fetchImpl:async()=>{reached++;return Response.json(result);}});
 for(const origin of ['https://evil.example','null'])assert.equal((await handler(request('POST','/api/whatsapp/transfers',{body:form(),headers:{Origin:origin,Authorization:'Bearer '+receipt}}))).status,403);
 assert.equal((await handler(request('DELETE',undefined,{headers:{Authorization:'Bearer '+receipt}}))).status,403);
 assert.equal((await handler(request('GET',undefined,{headers:{Origin:environment.SITE_URL}}))).status,404);
 assert.equal((await handler(request('GET',undefined,{headers:{Origin:environment.SITE_URL,Authorization:'Bearer '+receipt,'Sec-Fetch-Site':'cross-site'}}))).status,403);
 assert.equal((await handler(request('GET','/api/whatsapp/transfers/'+id+'?extra=1'))).status,404);
 assert.equal((await handler(request('POST','/api/whatsapp/transfers/'))).status,404);
 assert.equal((await handler(request('HEAD'))).status,405);assert.equal(reached,0);
});
test('declared and streamed bodies are bounded even without Content-Length',async()=>{
 let reached=0;const handler=createWhatsAppBridgeHandler({env:()=>environment,fetchImpl:async()=>{reached++;return Response.json(result);}});
 const headers={Origin:environment.SITE_URL,Authorization:'Bearer '+receipt,'Content-Type':'multipart/form-data; boundary=test'};
 assert.equal((await handler(request('POST','/api/whatsapp/transfers',{headers:{...headers,'Content-Length':String(4*1024*1024+1)},body:'x'}))).status,413);
 const response=await handler(request('POST','/api/whatsapp/transfers',{headers,body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4*1024*1024));controller.enqueue(new Uint8Array(1));controller.close();}}),duplex:'half'}));
 assert.equal(response.status,413);assert.equal(reached,0);
});
test('body read deadline cancels stalled streams and releases upload admission',async t=>{
 const keepAlive=setInterval(()=>{},1000);t.after(()=>clearInterval(keepAlive));
 let cancelled=false;
 const handler=createWhatsAppBridgeHandler({env:()=>environment,timeoutMs:30,fetchImpl:async()=>Response.json(result)});
 const response=await handler(request('POST','/api/whatsapp/transfers',{headers:{Origin:environment.SITE_URL,Authorization:'Bearer '+receipt,'Content-Type':'multipart/form-data; boundary=test'},body:new ReadableStream({cancel(){cancelled=true;}}),duplex:'half'}));
 assert.equal(response.status,408);assert.ok(cancelled);
 assert.equal((await handler(request('POST','/api/whatsapp/transfers',{body:form()}))).status,200);
});
test('unsafe links, wrong transfer identity and unbounded private replies are never exposed',async()=>{
 for(const value of [{...result,waUrl:'https://evil.example/file'},{...result,id:'bad'},{...result,waUrl:'https://wa.me/33612345678?text=wrong'},{...result,leak:'x'.repeat(9000)}]){
  const handler=createWhatsAppBridgeHandler({env:()=>environment,fetchImpl:async()=>Response.json(value)});
  const response=await handler(request());assert.ok([413,503].includes(response.status));assert.ok(!(await response.text()).includes('evil.example'));
 }
});
test('delete and status retain honest state, redact private fields and respect the sound gate',async()=>{
 const seen=[];const handler=createWhatsAppBridgeHandler({env:()=>({...environment,WHATSAPP_SOUND_ENABLED:'false'}),fetchImpl:async(url,init)=>{seen.push(init.method);return Response.json(url.pathname.endsWith('/status')?{enabled:true,ready:true,soundEnabled:true,qr:'secret'}:{id,state:'cancelled',expiresAt:result.expiresAt,recipient:'secret',claimCode:code});}});
 assert.deepEqual(await(await handler(request('GET','/api/whatsapp/status'))).json(),{enabled:true,ready:true,soundEnabled:false});
 assert.deepEqual(await(await handler(request('DELETE'))).json(),{id,state:'cancelled',expiresAt:result.expiresAt});assert.deepEqual(seen,['GET','DELETE']);
});

test('a temporarily unreachable private bridge keeps an enabled feature visible without claiming readiness',async()=>{
 const handler=createWhatsAppBridgeHandler({env:()=>environment,fetchImpl:async()=>{throw new Error('private address and credentials must not escape');}});
 const response=await handler(request('GET','/api/whatsapp/status'));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{enabled:true,ready:false,soundEnabled:true});
 assert.equal((await handler(request('POST','/api/whatsapp/transfers',{body:form()}))).status,503);
});

test('the public sound gate rejects a direct multipart request even when the private bot allows sound',async()=>{
 let fetched=false;
 const handler=createWhatsAppBridgeHandler({env:()=>({...environment,WHATSAPP_SOUND_ENABLED:'false'}),fetchImpl:async()=>{fetched=true;return Response.json(result);}});
 const body=form();body.append('sound',new Blob(['wav'],{type:'audio/wav'}),'sound.wav');
 const response=await handler(request('POST','/api/whatsapp/transfers',{body}));
 assert.equal(response.status,422);assert.deepEqual(await response.json(),{error:'sound_unavailable'});assert.equal(fetched,false);
});
