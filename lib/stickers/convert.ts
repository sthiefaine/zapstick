import {muxWebp} from './webp-mux';
import {inferMediaKind} from './media-kind';
import type {AnimationPreview} from './animation-preview';
import {paintOverlays,type OverlayOptions} from './overlays';
export type EditOptions=OverlayOptions & {zoom:number;rotation:number;text:string;background:string;animated:boolean;duration:number;start:number;offsetX?:number;offsetY?:number};
export const defaults:EditOptions={zoom:1,rotation:0,text:'',background:'transparent',animated:true,duration:3,start:0,offsetX:0,offsetY:0};
function canvas(){const c=document.createElement('canvas');c.width=c.height=512;return c;}
export function paint(c:HTMLCanvasElement,source:CanvasImageSource,w:number,h:number,o:EditOptions){const ctx=c.getContext('2d')!;ctx.clearRect(0,0,512,512);if(o.background!=='transparent'){ctx.fillStyle=o.background;ctx.fillRect(0,0,512,512);}const ratio=Math.min(512/w,512/h)*o.zoom;ctx.save();ctx.translate(256+(o.offsetX??0),256+(o.offsetY??0));ctx.rotate(o.rotation*Math.PI/180);ctx.drawImage(source,-w*ratio/2,-h*ratio/2,w*ratio,h*ratio);ctx.restore();paintOverlays(ctx,o);}
function checkSignal(signal?:AbortSignal):void{if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:new DOMException('Aborted','AbortError');}
function withSignal<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return promise;
 return new Promise((resolve,reject)=>{
  const abort=()=>{cleanup();reject(signal.reason instanceof Error?signal.reason:new DOMException('Aborted','AbortError'));};
  const cleanup=()=>signal.removeEventListener('abort',abort);
  signal.addEventListener('abort',abort,{once:true});
  promise.then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  if(signal.aborted)abort();
 });
}
export async function loadImage(url:string,signal?:AbortSignal):Promise<HTMLImageElement>{
 checkSignal(signal);
 return new Promise((resolve,reject)=>{
  const image=new Image();let settled=false;
  const timer=setTimeout(()=>finish(new Error('Impossible de charger ce média.')),10000);
  const abort=()=>finish(signal?.reason instanceof Error?signal.reason:new DOMException('Aborted','AbortError'));
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);image.onload=image.onerror=null;signal?.removeEventListener('abort',abort);if(error){image.removeAttribute('src');reject(error);}else resolve(image);}
  image.onload=()=>finish(image.width*image.height>40_000_000?new Error('Cette image est trop grande (40 mégapixels maximum).'):undefined);
  image.onerror=()=>finish(new Error('Image illisible. Essaie un PNG, JPEG, WebP ou GIF.'));
  signal?.addEventListener('abort',abort,{once:true});image.src=url;
 });
}
export async function loadVideo(url:string,signal?:AbortSignal):Promise<HTMLVideoElement>{
 checkSignal(signal);
 return new Promise((resolve,reject)=>{
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';let settled=false;
  const timer=setTimeout(()=>finish(new Error('La lecture vidéo prend trop de temps.')),10000);
  const abort=()=>finish(signal?.reason instanceof Error?signal.reason:new DOMException('Aborted','AbortError'));
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);video.onloadeddata=video.onerror=null;signal?.removeEventListener('abort',abort);if(error){video.pause();video.removeAttribute('src');video.load();reject(error);}else resolve(video);}
  video.onloadeddata=()=>finish(!Number.isFinite(video.duration)||video.duration<=0?new Error('Durée vidéo invalide.'):undefined);
  video.onerror=()=>finish(new Error('Cette vidéo ne peut pas être décodée par ton navigateur.'));
  signal?.addEventListener('abort',abort,{once:true});video.src=url;
 });
}
export async function seek(video:HTMLVideoElement,time:number,signal?:AbortSignal){
 checkSignal(signal);if(Math.abs(video.currentTime-time)<.001&&video.readyState>=2)return;
 await new Promise<void>((resolve,reject)=>{
  let settled=false;const previousSeek=video.onseeked,previousError=video.onerror;
  const timer=setTimeout(()=>finish(new Error('La lecture vidéo prend trop de temps.')),8000);
  const abort=()=>{video.pause();finish(signal?.reason instanceof Error?signal.reason:new DOMException('Aborted','AbortError'));};
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);video.onseeked=previousSeek;video.onerror=previousError;signal?.removeEventListener('abort',abort);if(error)reject(error);else resolve();}
  video.onseeked=()=>finish();video.onerror=()=>finish(new Error('Cette vidéo ne peut pas être décodée par ton navigateur.'));
  signal?.addEventListener('abort',abort,{once:true});try{video.currentTime=time;}catch(error){finish(error instanceof Error?error:new Error('Cette vidéo ne peut pas être lue.'));}
 });
}
async function webp(canvas:HTMLCanvasElement,quality:number,signal?:AbortSignal):Promise<Blob>{
 checkSignal(signal);const blob=await withSignal(new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/webp',quality)),signal);
 if(!blob||blob.type!=='image/webp')throw new Error('L’export WebP nécessite un navigateur récent, comme Chrome, Edge ou Safari.');return blob;
}
export {muxWebp} from './webp-mux';
export async function convert(blob:Blob,o:EditOptions,onProgress:(n:number)=>void,signal?:AbortSignal):Promise<{blob:Blob;animated:boolean}>{
 checkSignal(signal);const controller=new AbortController(),relay=()=>controller.abort(signal?.reason);signal?.addEventListener('abort',relay,{once:true});
 const timer=setTimeout(()=>controller.abort(new Error('La préparation de l’animation prend trop de temps. Essaie un média plus court.')),90000),operation=controller.signal;
 const url=URL.createObjectURL(blob),c=canvas();
 let video:HTMLVideoElement|undefined,preview:AnimationPreview|undefined,frame:HTMLCanvasElement|undefined;
 try{
  const isVideo=blob.type.startsWith('video/'),animatedImage=!isVideo&&await withSignal(inferMediaKind(blob),operation)==='animated';
  let duration=0,frameAt:(time:number)=>Promise<{source:CanvasImageSource;w:number;h:number}>;
  if(isVideo){
   video=await loadVideo(url,operation);duration=video.duration;
   frameAt=async(time)=>{await seek(video!,Math.min(Math.max(0,time),Math.max(0,duration-.001)),operation);return{source:video!,w:video!.videoWidth,h:video!.videoHeight};};
  }else if(animatedImage){
   const{createAnimationPreview}=await withSignal(import('./animation-preview'),operation);
   preview=await createAnimationPreview(blob,operation,{thumbnails:false});duration=preview.duration;
   frame=document.createElement('canvas');frame.width=frame.height=0;
   frameAt=async(time)=>{await preview!.drawAt!(frame!,Math.min(Math.max(0,time),Math.max(0,duration-.001)));return{source:frame!,w:frame!.width,h:frame!.height};};
  }else{
   const image=await loadImage(url,operation);frameAt=async()=>({source:image,w:image.naturalWidth,h:image.naturalHeight});
  }
  if(!o.animated||(!isVideo&&!animatedImage)){
   const source=await frameAt(Number.isFinite(o.start)?o.start:0);paint(c,source.source,source.w,source.h,o);
   for(const quality of [.9,.75,.55,.35,.18]){const result=await webp(c,quality,operation);if(result.size<=100*1024)return{blob:result,animated:false};}
   throw new Error('L’image dépasse 100 Ko. Réduis le zoom ou simplifie le fond.');
  }
  const start=Math.min(Math.max(0,Number.isFinite(o.start)?o.start:0),Math.max(0,duration-.001)),length=Math.min(o.duration,6,duration-start);
  if(!Number.isFinite(length)||length<=0)throw new Error('Choisis une durée d’animation valide.');
  for(let pass=0;pass<3;pass++){
   const fps=[12,8,5][pass],quality=[.68,.42,.22][pass],count=Math.max(2,Math.ceil(length*fps)),frames:{bytes:Uint8Array;duration:number}[]=[];
   for(let index=0;index<count;index++){
    checkSignal(operation);const source=await frameAt(start+(index/count)*length);paint(c,source.source,source.w,source.h,o);
    frames.push({bytes:new Uint8Array(await withSignal((await webp(c,quality,operation)).arrayBuffer(),operation)),duration:Math.round((index+1)*length*1000/count)-Math.round(index*length*1000/count)});
    onProgress(Math.round(((pass+index/count)/3)*100));
   }
   checkSignal(operation);const result=muxWebp(frames,{loopCount:preview?.loopCount});if(result.size<=500*1024){onProgress(100);checkSignal(operation);return{blob:result,animated:true};}
  }
  throw new Error('L’animation dépasse 500 Ko. Essaie une durée plus courte ou « Image fixe ».');
 }catch(error){checkSignal(operation);throw error;}finally{
  clearTimeout(timer);signal?.removeEventListener('abort',relay);preview?.dispose();if(frame)frame.width=frame.height=0;
  if(video){video.pause();video.removeAttribute('src');video.load();}
  c.width=c.height=0;URL.revokeObjectURL(url);
 }
}
