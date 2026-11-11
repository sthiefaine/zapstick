import {InferenceSession,Tensor,env} from 'onnxruntime-web/wasm';
import {backgroundAlpha,boundedDimensions,prepareBackgroundTensor,BackgroundRemovalError} from './background-removal-core';

const scope=globalThis as unknown as {location:Location;onmessage:((event:MessageEvent<{blob:Blob;model:ArrayBuffer}>)=>void)|null;postMessage:(message:unknown)=>void};
scope.onmessage=async({data:{blob,model}})=>{
 let session:InferenceSession|undefined;
 try{
  env.wasm.numThreads=1;env.wasm.proxy=false;
  const prefix=new URL('/vendor/onnx/1.31.1/',scope.location.origin).href;
  env.wasm.wasmPaths={mjs:`${prefix}ort-wasm-simd-threaded.mjs`,wasm:`${prefix}ort-wasm-simd-threaded.wasm`};
  const bitmap=await createImageBitmap(blob),size=boundedDimensions(bitmap.width,bitmap.height),output=new OffscreenCanvas(size.width,size.height),context=output.getContext('2d');
  if(!context)throw new BackgroundRemovalError('unsupported');
  context.drawImage(bitmap,0,0,size.width,size.height);bitmap.close();
  const inputCanvas=new OffscreenCanvas(320,320),inputContext=inputCanvas.getContext('2d');
  if(!inputContext)throw new BackgroundRemovalError('unsupported');
  inputContext.drawImage(output,0,0,320,320);
  const input=new Tensor('float32',prepareBackgroundTensor(inputContext.getImageData(0,0,320,320).data),[1,3,320,320]);
  session=await InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all',executionMode:'sequential',enableCpuMemArena:false,enableMemPattern:false});
  const result=await session.run({[session.inputNames[0]]:input},[session.outputNames[0]]),prediction=result[session.outputNames[0]];
  if(!(prediction.data instanceof Float32Array)||prediction.data.length!==320*320)throw new BackgroundRemovalError('model');
  const maskCanvas=new OffscreenCanvas(320,320),maskContext=maskCanvas.getContext('2d');
  if(!maskContext)throw new BackgroundRemovalError('unsupported');
  maskContext.putImageData(new ImageData(backgroundAlpha(prediction.data),320,320),0,0);
  context.globalCompositeOperation='destination-in';context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(maskCanvas,0,0,size.width,size.height);
  const outputBlob=await output.convertToBlob({type:'image/png'});
  await session.release();session=undefined;scope.postMessage({type:'result',blob:outputBlob});
 }catch(error){scope.postMessage({type:'error',code:error instanceof BackgroundRemovalError?error.code:'model'});}
 finally{if(session)await session.release().catch(()=>{});}
};
