import {BACKGROUND_MODEL_BYTES,BACKGROUND_MODEL_CACHE,BACKGROUND_MODEL_SHA256,BACKGROUND_MODEL_URL,BackgroundRemovalError,inspectBackgroundImage,type BackgroundErrorCode,type BackgroundProgress} from './background-removal-core';
export {BACKGROUND_MODEL_CACHE,BackgroundRemovalError} from './background-removal-core';
export type {BackgroundProgress} from './background-removal-core';

const active=new Map<AbortController,Promise<Blob>>();
let clearing:Promise<void>|undefined;
const check=(signal:AbortSignal)=>{if(signal.aborted)throw new BackgroundRemovalError(signal.reason==='timeout'?'timeout':'cancelled');};
async function verifiedModel(bytes:ArrayBuffer){
 if(bytes.byteLength!==BACKGROUND_MODEL_BYTES)throw new BackgroundRemovalError('download');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
 if(hash!==BACKGROUND_MODEL_SHA256)throw new BackgroundRemovalError('download');return bytes;
}
async function downloadModel(signal:AbortSignal,onProgress?:(progress:BackgroundProgress)=>void){
 let cache:Cache|undefined;
 try{cache=await caches.open(BACKGROUND_MODEL_CACHE);const cached=await cache.match(BACKGROUND_MODEL_URL);if(cached){const buffer=await verifiedModel(await cached.arrayBuffer());check(signal);return buffer;}}catch{/* Storage may be unavailable; the current operation can still run. */}
 check(signal);onProgress?.({stage:'downloading',percent:0});
 const response=await fetch(BACKGROUND_MODEL_URL,{credentials:'omit',referrerPolicy:'no-referrer',signal,cache:'no-store'});
 if(!response.ok||!response.body)throw new BackgroundRemovalError('download');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[],total=BACKGROUND_MODEL_BYTES;let loaded=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;loaded+=value.byteLength;if(loaded>total)throw new BackgroundRemovalError('download');chunks.push(value);onProgress?.({stage:'downloading',percent:Math.min(100,Math.floor(100*loaded/total))});}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const buffer=await verifiedModel(bytes.buffer);check(signal);
 if(cache)try{await cache.put(BACKGROUND_MODEL_URL,new Response(buffer.slice(0),{headers:{'Content-Type':'application/octet-stream'}}));}catch{/* Cache quota does not prevent local inference. */}
 check(signal);return buffer;
}
function infer(blob:Blob,model:ArrayBuffer,signal:AbortSignal):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./background-removal.worker.ts',import.meta.url),{type:'module'});
  const finish=(fn:()=>void)=>{signal.removeEventListener('abort',cancel);worker.terminate();fn();};
  const cancel=()=>finish(()=>reject(new BackgroundRemovalError(signal.reason==='timeout'?'timeout':'cancelled')));
  worker.onmessage=({data}:{data:{type:string;blob?:Blob;code?:BackgroundErrorCode}})=>finish(()=>data.type==='result'&&data.blob?resolve(data.blob):reject(new BackgroundRemovalError(data.code??'model')));
  worker.onerror=()=>finish(()=>reject(new BackgroundRemovalError('model')));
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}
  try{worker.postMessage({blob,model},[model]);}catch{finish(()=>reject(new BackgroundRemovalError('model')));}
 });
}
/** No worker, model request or ONNX runtime is loaded until this function is called. */
export async function removeImageBackground(blob:Blob,{signal,onProgress,timeoutMs=180_000}:{signal?:AbortSignal;onProgress?:(progress:BackgroundProgress)=>void;timeoutMs?:number}={}):Promise<Blob>{
 if(clearing||active.size)throw new BackgroundRemovalError('busy');
 if(typeof window==='undefined'||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined'||!crypto.subtle)throw new BackgroundRemovalError('unsupported');
 if(blob.size>20*1024*1024)throw new BackgroundRemovalError('too-large');
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason),timer=setTimeout(()=>controller.abort('timeout'),timeoutMs);
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const job=(async()=>{
  try{check(controller.signal);onProgress?.({stage:'preparing'});inspectBackgroundImage(new Uint8Array(await blob.slice(0,512*1024).arrayBuffer()));check(controller.signal);
   const model=await downloadModel(controller.signal,onProgress);check(controller.signal);onProgress?.({stage:'processing'});return await infer(blob,model,controller.signal);
  }catch(error){if(controller.signal.aborted)check(controller.signal);if(error instanceof BackgroundRemovalError)throw error;throw new BackgroundRemovalError('download');}
 })();
 active.set(controller,job);
 try{return await job;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);active.delete(controller);}
}
/** Stop work first, so an in-flight download cannot repopulate the cache after erasure. */
export async function clearBackgroundModelCache():Promise<void>{
 if(clearing)return clearing;
 clearing=(async()=>{for(const controller of active.keys())controller.abort();await Promise.allSettled([...active.values()]);if(typeof caches!=='undefined')await caches.delete(BACKGROUND_MODEL_CACHE);})();
 try{await clearing;}finally{clearing=undefined;}
}
