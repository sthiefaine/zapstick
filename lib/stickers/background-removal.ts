import {BACKGROUND_ANIMATION_LIMITS,BACKGROUND_MODEL_BYTES,BACKGROUND_MODEL_CACHE,BACKGROUND_MODEL_SHA256,BACKGROUND_MODEL_URL,BackgroundRemovalError,inspectBackgroundImage,planBackgroundAnimation,type BackgroundErrorCode,type BackgroundProgress} from './background-removal-core';
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
function infer(blob:Blob,model:ArrayBuffer,signal:AbortSignal,kind:'image'|'animated',onProgress?:(progress:BackgroundProgress)=>void):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  let worker:Worker;try{worker=new Worker(new URL('./background-removal.worker.ts',import.meta.url),{type:'module'});}catch{reject(new BackgroundRemovalError('unsupported'));return;}
  let finished=false;
  const finish=(fn:()=>void)=>{if(finished)return;finished=true;signal.removeEventListener('abort',cancel);worker.onmessage=worker.onerror=worker.onmessageerror=null;worker.terminate();fn();};
  const cancel=()=>finish(()=>reject(new BackgroundRemovalError(signal.reason==='timeout'?'timeout':'cancelled')));
  worker.onmessage=({data}:{data:{type:string;blob?:Blob;code?:BackgroundErrorCode;progress?:BackgroundProgress;diagnostic?:{kind:string;stage:string;name:string;code?:string|number;message:string}}})=>{
   if(finished)return;
   if(data.type==='progress'&&data.progress){onProgress?.(data.progress);return;}
   if(data.type==='error'&&data.diagnostic)console.error('[Zapstick background removal]',data.diagnostic);
   finish(()=>data.type==='result'&&data.blob?.type===(kind==='animated'?'image/webp':'image/png')?resolve(data.blob):reject(new BackgroundRemovalError(data.code??'model')));
  };
  worker.onerror=()=>finish(()=>reject(new BackgroundRemovalError('model')));
  worker.onmessageerror=()=>finish(()=>reject(new BackgroundRemovalError('model')));
  signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return;}
  try{worker.postMessage({blob,model,kind},[model]);}catch{finish(()=>reject(new BackgroundRemovalError('model')));}
 });
}
export type BackgroundRemovalOptions={signal?:AbortSignal;onProgress?:(progress:BackgroundProgress)=>void;timeoutMs?:number};
async function removeBackground(blob:Blob,kind:'image'|'animated',{signal,onProgress,timeoutMs}:BackgroundRemovalOptions):Promise<Blob>{
 if(signal?.aborted)throw new BackgroundRemovalError('cancelled');
 if(clearing||active.size)throw new BackgroundRemovalError('busy');
 if(typeof window==='undefined'||typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined'||typeof createImageBitmap==='undefined'||typeof crypto==='undefined'||!crypto.subtle)throw new BackgroundRemovalError('unsupported');
 if(blob.size>(kind==='animated'?BACKGROUND_ANIMATION_LIMITS.inputBytes:20*1024*1024))throw new BackgroundRemovalError(kind==='animated'?'animation-too-large':'too-large');
 const maximumTimeout=kind==='animated'?BACKGROUND_ANIMATION_LIMITS.timeoutMs:180_000;
 const budget=typeof timeoutMs==='number'&&Number.isFinite(timeoutMs)?Math.max(1,Math.min(timeoutMs,maximumTimeout)):maximumTimeout;
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason),timer=setTimeout(()=>controller.abort('timeout'),budget);
 const progress=(value:BackgroundProgress)=>{try{onProgress?.(value);}catch{/* UI callbacks cannot strand an active job. */}};
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const job=Promise.resolve().then(async()=>{
  try{
   check(controller.signal);progress({stage:'preparing'});
   if(kind==='animated'){
    const {parseWebpAnimation}=await import('./webp-animation');check(controller.signal);
    try{planBackgroundAnimation(parseWebpAnimation(new Uint8Array(await blob.arrayBuffer())));}catch(error){if(error instanceof BackgroundRemovalError)throw error;throw new BackgroundRemovalError(error&&typeof error==='object'&&'code' in error&&error.code==='too-large'?'animation-too-large':'invalid-animation');}
   }else inspectBackgroundImage(new Uint8Array(await blob.slice(0,512*1024).arrayBuffer()));
   check(controller.signal);
   const model=await downloadModel(controller.signal,progress);check(controller.signal);progress({stage:'processing',...(kind==='animated'?{percent:0}:{})});return await infer(blob,model,controller.signal,kind,progress);
  }catch(error){if(controller.signal.aborted)check(controller.signal);if(error instanceof BackgroundRemovalError)throw error;throw new BackgroundRemovalError('download');}
 });
 active.set(controller,job);
 try{return await job;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);active.delete(controller);}
}
/** No worker, model request or ONNX runtime is loaded until an explicit call. */
export async function removeImageBackground(blob:Blob,options:BackgroundRemovalOptions={}):Promise<Blob>{return removeBackground(blob,'image',options);}
/** Input: prepared512×512 WebP,0.25–6seconds. Output: genuine animated WebP with
 * continuous alpha, original loop/duration and at most48 inference frames. */
export async function removeAnimatedBackground(blob:Blob,options:BackgroundRemovalOptions={}):Promise<Blob>{return removeBackground(blob,'animated',options);}
/** Stop work first, so an in-flight download cannot repopulate the cache after erasure. */
export async function clearBackgroundModelCache():Promise<void>{
 if(clearing)return clearing;
 clearing=(async()=>{for(const controller of active.keys())controller.abort();await Promise.allSettled([...active.values()]);if(typeof caches!=='undefined')await caches.delete(BACKGROUND_MODEL_CACHE);})();
 try{await clearing;}finally{clearing=undefined;}
}
