import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../lib/stickers/whatsapp-transfer.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const module={exports:{}};new Function('exports','module',source)(module.exports,module);
const {createWhatsAppTransferClient,WHATSAPP_RECEIPTS_KEY,WhatsAppTransferError,saveWhatsAppSnapshot}=module.exports;
const now=()=>1_700_000_000_000;
class MemoryStorage{data=new Map();getItem(key){return this.data.get(key)??null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
function sticker(visual='finished visual',sound){return{id:'my-sticker',name:'Private sticker title',isSticker:true,mime:'image/webp',kind:sound?'animated':'static',blob:new Blob([visual],{type:'image/webp'}),...(sound?{sound:{blob:new Blob([sound],{type:'audio/wav'}),name:'Private sound title',duration:1}}:{})};}
function server(storage,{losePost=false,rejectPost=false,unsafeLink=false}={}){
 const jobs=new Map(),calls=[];let lost=false;
 const fetchImpl=async(url,init={})=>{
  const method=init.method||'GET',path=String(url);calls.push({path,method,init});
  if(path==='/api/whatsapp/status')return Response.json({enabled:true,ready:true,soundEnabled:true});
  if(method==='POST'){
   const manifest=JSON.parse(init.body.get('manifest'));const saved=JSON.parse(storage.getItem(WHATSAPP_RECEIPTS_KEY));
   const record=saved.receipts.find(item=>item.id===manifest.id);assert.ok(record,'persisted before upload');assert.equal(init.headers.Authorization,'Bearer '+record.receipt);
   const claimCode=Buffer.alloc(16,1).toString('base64url'),value={id:manifest.id,state:'awaiting_message',expiresAt:now()+600000,claimCode,waUrl:unsafeLink?'javascript:alert(1)':'https://wa.me/33612345678?text='+encodeURIComponent('ZAP '+claimCode)};
   if(!rejectPost)jobs.set(manifest.id,value);
   if((losePost||rejectPost)&&!lost){lost=true;throw new TypeError('Network interrupted');}
   return Response.json(value,{status:201});
  }
  const id=path.split('/').at(-1),value=jobs.get(id);
  if(!value)return Response.json({error:'not_found'},{status:404});
  if(method==='DELETE'){
   if(['sending','accepted','delivered','delivery_unknown'].includes(value.state))return Response.json({error:'conflict'},{status:409});
   const cancelled={id,state:'cancelled',expiresAt:value.expiresAt};jobs.set(id,cancelled);return Response.json(cancelled);
  }
  return Response.json(value);
 };
 return{fetchImpl,calls,jobs};
}
function setup(options={}){const storage=new MemoryStorage(),backend=server(storage,options),client=createWhatsAppTransferClient({getStorage:()=>storage,cryptoImpl:webcrypto,now,fetchImpl:backend.fetchImpl});return{storage,backend,client};}

test('availability and empty recovery do not upload or persist media',async()=>{
 const {storage,backend,client}=setup();assert.equal((await client.status()).ready,true);assert.equal(await client.resume(sticker()),null);assert.equal(backend.calls.length,1);assert.equal(storage.data.size,0);
});
test('double appui uses one persisted capability and sends only final WebP and mixed WAV',async()=>{
 const {storage,backend,client}=setup(),item=sticker('final visual','already mixed audio');
 const [first,second]=await Promise.all([client.prepare(item,'fr'),client.prepare(item,'fr')]);
 assert.equal(first.id,second.id);assert.equal(backend.calls.filter(call=>call.method==='POST').length,1);
 const body=backend.calls[0].init.body;assert.deepEqual([...body.keys()],['manifest','visual','sound']);assert.equal(await body.get('visual').text(),'final visual');assert.equal(await body.get('sound').text(),'already mixed audio');
 const saved=storage.getItem(WHATSAPP_RECEIPTS_KEY);assert.ok(!saved.includes('already mixed audio'));assert.ok(!saved.includes('Private sticker title'));assert.ok(!saved.includes('claimCode'));assert.match(JSON.parse(saved).receipts[0].receipt,/^[\w-]{43}$/);
});
test('lost upload response is recovered after reload with GET and no second upload',async()=>{
 const {storage,backend,client}=setup({losePost:true}),item=sticker();await assert.rejects(client.prepare(item,'fr'),TypeError);
 const id=JSON.parse(storage.getItem(WHATSAPP_RECEIPTS_KEY)).receipts[0].id;
 const reloaded=createWhatsAppTransferClient({getStorage:()=>storage,cryptoImpl:webcrypto,now,fetchImpl:backend.fetchImpl});
 assert.equal((await reloaded.prepare(item,'en')).id,id);assert.deepEqual(backend.calls.map(call=>call.method),['POST','GET']);
});
test('when an interrupted upload was never admitted, retry GET then POST uses the same ID, receipt and locale',async()=>{
 const {storage,backend,client}=setup({rejectPost:true}),item=sticker();await assert.rejects(client.prepare(item,'fr'));
 const original=JSON.parse(storage.getItem(WHATSAPP_RECEIPTS_KEY)).receipts[0];
 const result=await client.prepare(item,'ja');assert.equal(result.id,original.id);assert.deepEqual(backend.calls.map(call=>call.method),['POST','GET','POST']);
 const posts=backend.calls.filter(call=>call.method==='POST');assert.equal(posts[0].init.headers.Authorization,posts[1].init.headers.Authorization);assert.equal(JSON.parse(posts[1].init.body.get('manifest')).locale,'fr');
});
test('changed visual or audio cannot inherit a previous WhatsApp code',async()=>{
 const {backend,client}=setup();const first=await client.prepare(sticker('visual','first mix'),'fr'),second=await client.prepare(sticker('visual','other mix'),'fr'),third=await client.prepare(sticker('new visual','first mix'),'fr');
 assert.notEqual(first.id,second.id);assert.notEqual(first.id,third.id);assert.equal(backend.calls.filter(call=>call.method==='POST').length,3);
});
test('receiving again is explicit and cannot silently replay an uncertain delivery',async()=>{
 const {backend,client}=setup(),item=sticker();const first=await client.prepare(item,'fr');backend.jobs.set(first.id,{id:first.id,state:'delivery_unknown',expiresAt:first.expiresAt});
 assert.equal((await client.prepare(item,'fr',{fresh:true})).id,first.id);assert.equal(backend.calls.filter(call=>call.method==='POST').length,1);
 backend.jobs.set(first.id,{id:first.id,state:'accepted',expiresAt:first.expiresAt});const second=await client.prepare(item,'fr',{fresh:true});assert.notEqual(first.id,second.id);assert.equal(backend.calls.filter(call=>call.method==='POST').length,2);
});
test('cancellation is server confirmed and conflict never becomes a false cancelled state',async()=>{
 const {backend,client}=setup(),item=sticker();const first=await client.prepare(item,'fr');assert.equal((await client.cancel(first.id)).state,'cancelled');
 const next=await client.prepare(item,'fr',{fresh:true});backend.jobs.set(next.id,{id:next.id,state:'sending',expiresAt:next.expiresAt});await assert.rejects(client.cancelFor(item),error=>error instanceof WhatsAppTransferError&&error.status===409);assert.equal((await client.get(next.id)).state,'sending');
});
test('clearing receipts works offline and never requires a successful DELETE',async()=>{
 const {storage,backend,client}=setup();await client.prepare(sticker(),'fr');
 const offline=createWhatsAppTransferClient({getStorage:()=>storage,cryptoImpl:webcrypto,now,fetchImpl:async()=>{throw new TypeError('Offline');}});await offline.clear();assert.equal(storage.getItem(WHATSAPP_RECEIPTS_KEY),null);assert.equal(backend.calls.length,1);
});
test('clear during upload aborts it and an old response cannot repopulate cleared receipts',async()=>{
 const storage=new MemoryStorage();let started;const ready=new Promise(resolve=>{started=resolve;});
 const client=createWhatsAppTransferClient({getStorage:()=>storage,cryptoImpl:webcrypto,now,fetchImpl:async(_url,init)=>{
  if(init.method==='POST'){started();return await new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));}
  return Response.json({error:'not_found'},{status:404});
 }});
 const prepare=client.prepare(sticker(),'fr');await ready;const rejected=assert.rejects(prepare,error=>error.name==='AbortError');await client.clear();await rejected;assert.equal(storage.getItem(WHATSAPP_RECEIPTS_KEY),null);
});
test('blocked persistence prevents uploading and unsafe navigation links are rejected',async()=>{
 let uploads=0;const client=createWhatsAppTransferClient({getStorage:()=>({getItem:()=>null,setItem(){throw new Error('Blocked');}}),cryptoImpl:webcrypto,now,fetchImpl:async()=>{uploads++;throw new Error();}});
 await assert.rejects(client.prepare(sticker(),'fr'),error=>error.code==='storage');assert.equal(uploads,0);
 const unsafe=setup({unsafeLink:true});await assert.rejects(unsafe.client.prepare(sticker(),'fr'),error=>error.code==='unavailable');
});
test('terminal receipts do not impose a daily twenty-sticker cap',async()=>{
 const {storage,backend,client}=setup();
 for(let index=0;index<25;index++){const result=await client.prepare(sticker(String(index)),'fr');backend.jobs.set(result.id,{id:result.id,state:'accepted',expiresAt:result.expiresAt});await client.get(result.id);}
 assert.ok(JSON.parse(storage.getItem(WHATSAPP_RECEIPTS_KEY)).receipts.length<=20);assert.equal(backend.calls.filter(call=>call.method==='POST').length,25);
});

test('authenticated HTTP410 becomes expired and an explicit fresh action creates a new code',async()=>{
 const {storage,backend,client}=setup(),item=sticker();const first=await client.prepare(item,'fr');
 const expired=createWhatsAppTransferClient({getStorage:()=>storage,cryptoImpl:webcrypto,now,fetchImpl:async(url,init)=>String(url).endsWith('/'+first.id)?Response.json({error:'expired'},{status:410}):backend.fetchImpl(url,init)});
 assert.equal((await expired.get(first.id)).state,'expired');
 const recovered=await expired.prepare(item,'fr',{fresh:true});assert.notEqual(recovered.id,first.id);assert.equal(backend.calls.filter(call=>call.method==='POST').length,2);
});

test('WhatsApp return restores the saved sticker once and is cleared with local data',async()=>{
 const {client}=setup();client.rememberReturn('saved-sticker');assert.equal(client.consumeReturn(),'saved-sticker');assert.equal(client.consumeReturn(),null);client.rememberReturn('another-sticker');await client.clear();assert.equal(client.consumeReturn(),null);
});

test('the durable collection write completes before any media POST and a failed write prevents upload',async()=>{
 const {storage,backend,client}=setup();let release,started;
 const persisted=new Promise(resolve=>{release=resolve;}),beforeStarted=new Promise(resolve=>{started=resolve;});
 const preparing=client.prepare(sticker(),'fr',{beforePrepare:async()=>{started();await persisted;}});
 await beforeStarted;assert.equal(backend.calls.length,0);assert.equal(storage.getItem(WHATSAPP_RECEIPTS_KEY),null);
 release();await preparing;assert.equal(backend.calls.filter(call=>call.method==='POST').length,1);
 const failed=setup();await assert.rejects(failed.client.prepare(sticker(),'fr',{beforePrepare:async()=>{throw new WhatsAppTransferError('storage');}}),error=>error.code==='storage');
 assert.equal(failed.backend.calls.length,0);assert.equal(failed.storage.getItem(WHATSAPP_RECEIPTS_KEY),null);
});

test('explicit durable saves stay ordered with older pending saves and later collection edits',async()=>{
 const saved=[];let release;
 const oldWrite=new Promise(resolve=>{release=resolve;});
 const queue={current:oldWrite.then(()=>{saved.push('previous');})};
 const current={version:1,stickers:[sticker('current')],packs:[]},later={...current,stickers:[...current.stickers,sticker('later')]};
 const persist=async value=>{saved.push(value);};
 const durable=saveWhatsAppSnapshot(queue,current,persist);
 queue.current=queue.current.then(()=>persist(later));
 assert.deepEqual(saved,[]);release();await durable;await queue.current;
 assert.deepEqual(saved,['previous',current,later]);assert.equal(saved.at(-1).stickers.length,2);
 const rejected={current:Promise.reject(new Error('old routine write failed'))};
 await saveWhatsAppSnapshot(rejected,later,persist);
 await assert.rejects(saveWhatsAppSnapshot(rejected,current,async()=>{throw new Error('durable write failed');}),/durable write failed/);
});
