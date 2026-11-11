import {InferenceSession,env} from 'onnxruntime-web/wasm';
import {BACKGROUND_ANIMATION_LIMITS,boundedDimensions,planBackgroundAnimation,BackgroundRemovalError} from './background-removal-core';
import {createBackgroundFrameProcessor} from './background-removal-inference';
import {parseWebpAnimation,decodeWebpFrames} from './webp-animation';
import {muxWebp} from './webp-mux';
import {GifExportError} from './gif-export-core';

const scope=globalThis as unknown as {location:Location;onmessage:((event:MessageEvent<{blob:Blob;model:ArrayBuffer;kind?:'image'|'animated'}>)=>void)|null;postMessage:(message:unknown)=>void};
scope.onmessage=async({data:{blob,model,kind='image'}})=>{
 let session:InferenceSession|undefined,processor:ReturnType<typeof createBackgroundFrameProcessor>|undefined;
 let stage='preparing';
 try{
  env.wasm.numThreads=1;env.wasm.proxy=false;
  const prefix=new URL('/vendor/onnx/1.31.1/',scope.location.origin).href;
  env.wasm.wasmPaths={mjs:`${prefix}ort-wasm-simd-threaded.mjs`,wasm:`${prefix}ort-wasm-simd-threaded.wasm`};
  let outputBlob:Blob;
  if(kind==='animated'){
   if(blob.size>BACKGROUND_ANIMATION_LIMITS.inputBytes)throw new BackgroundRemovalError('animation-too-large');
   const bytes=new Uint8Array(await blob.arrayBuffer()),animation=parseWebpAnimation(bytes),plan=planBackgroundAnimation(animation);
   // Check native WebP encoding before starting any expensive inference. Canvas
   // may otherwise silently return PNG when the requested format is unsupported.
   stage='encoding-check';const probe=new OffscreenCanvas(1,1);
   try{const context=probe.getContext('2d');if(!context)throw new BackgroundRemovalError('unsupported');context.clearRect(0,0,1,1);context.fillStyle='#000000';context.fillRect(0,0,1,1);if((await probe.convertToBlob({type:'image/webp'})).type!=='image/webp')throw new BackgroundRemovalError('encoding');}
   finally{probe.width=probe.height=0;}
   stage='session-create';
   session=await InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential',enableCpuMemArena:false,enableMemPattern:false});
   stage='processor-create';
   processor=createBackgroundFrameProcessor(session,512,512);
   const frames:{bytes:Uint8Array;duration:number}[]=[];let sample=0,encodedBytes=0;
   stage='frame-decode';for await(const frame of decodeWebpFrames(bytes,animation,{strategy:'bitmap'})){
    if(frame.index!==plan.samples[sample]?.sourceIndex)continue;
    stage='frame-inference';const output=await processor.process(frame.canvas);stage='frame-encode';const encoded=await output.convertToBlob({type:'image/webp',quality:.82});
    if(encoded.type!=='image/webp')throw new BackgroundRemovalError('encoding');
    encodedBytes+=encoded.size;if(encodedBytes>BACKGROUND_ANIMATION_LIMITS.encodedBytes)throw new BackgroundRemovalError('animation-too-large');
    frames.push({bytes:new Uint8Array(await encoded.arrayBuffer()),duration:plan.samples[sample].durationMs});sample++;
    scope.postMessage({type:'progress',progress:{stage:'processing',percent:Math.round(sample/plan.samples.length*100)}});
    stage='frame-decode';
   }
   if(sample!==plan.samples.length)throw new BackgroundRemovalError('invalid-animation');
   stage='mux';outputBlob=muxWebp(frames,{loopCount:animation.loopCount});
   if(outputBlob.size>BACKGROUND_ANIMATION_LIMITS.encodedBytes)throw new BackgroundRemovalError('animation-too-large');
  }else{
   stage='image-decode';const bitmap=await createImageBitmap(blob);let prepared:OffscreenCanvas|undefined;
   try{
    let size:{width:number;height:number};
    try{
     size=boundedDimensions(bitmap.width,bitmap.height);prepared=new OffscreenCanvas(size.width,size.height);
     const context=prepared.getContext('2d');if(!context)throw new BackgroundRemovalError('unsupported');
     context.drawImage(bitmap,0,0,size.width,size.height);
    }finally{bitmap.close();}
    // Large camera bitmaps are released before allocating the ONNX session.
    // Keep only the bounded prepared surface while inference is running.
    stage='session-create';session=await InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential',enableCpuMemArena:false,enableMemPattern:false});
    processor=createBackgroundFrameProcessor(session,size.width,size.height);
    stage='frame-inference';const output=await processor.process(prepared);stage='frame-encode';outputBlob=await output.convertToBlob({type:'image/png'});
   }finally{if(prepared)prepared.width=prepared.height=0;}
  }
  stage='release';processor.dispose();processor=undefined;await session.release();session=undefined;
  scope.postMessage({type:'result',blob:outputBlob});
 }catch(error){
  let code=error instanceof BackgroundRemovalError?error.code:'model';
  if(kind==='animated'&&error instanceof GifExportError)code=error.code==='too-large'?'animation-too-large':'invalid-animation';
  const rawCode=error&&typeof error==='object'&&'code' in error?error.code:undefined;
  const diagnostic={kind,stage,name:error instanceof Error?error.name:typeof error,code:typeof rawCode==='string'||typeof rawCode==='number'?rawCode:undefined,message:error instanceof Error?error.message.slice(0,300):'Worker failed'};
  scope.postMessage({type:'error',code,diagnostic});
 }finally{processor?.dispose();if(session)await session.release().catch(()=>{});}
};
