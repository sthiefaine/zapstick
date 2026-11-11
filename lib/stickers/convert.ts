export type EditOptions={zoom:number;rotation:number;text:string;background:string;animated:boolean;duration:number;start:number;offsetX?:number;offsetY?:number};
export const defaults:EditOptions={zoom:1,rotation:0,text:'',background:'transparent',animated:true,duration:3,start:0,offsetX:0,offsetY:0};
function canvas(){const c=document.createElement('canvas');c.width=c.height=512;return c;}
export function paint(c:HTMLCanvasElement,source:CanvasImageSource,w:number,h:number,o:EditOptions){const ctx=c.getContext('2d')!;ctx.clearRect(0,0,512,512);if(o.background!=='transparent'){ctx.fillStyle=o.background;ctx.fillRect(0,0,512,512);}const ratio=Math.min(512/w,512/h)*o.zoom;ctx.save();ctx.translate(256+(o.offsetX??0),256+(o.offsetY??0));ctx.rotate(o.rotation*Math.PI/180);ctx.drawImage(source,-w*ratio/2,-h*ratio/2,w*ratio,h*ratio);ctx.restore();if(o.text){ctx.font='900 44px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=10;ctx.lineJoin='round';ctx.strokeStyle='#ffffff';ctx.fillStyle='#17191e';const text=o.text.slice(0,45);ctx.strokeText(text,256,447,455);ctx.fillText(text,256,447,455);}}
export async function loadImage(url:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>{if(i.width*i.height>40_000_000){reject(new Error('Cette image est trop grande (40 mégapixels maximum).'));return;}resolve(i);};i.onerror=()=>reject(new Error('Image illisible. Essaie un PNG, JPEG, WebP ou GIF.'));i.src=url;});}
export function loadVideo(url:string):Promise<HTMLVideoElement>{return new Promise((resolve,reject)=>{const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';v.onloadeddata=()=>{if(!Number.isFinite(v.duration)||v.duration<=0){reject(new Error('Durée vidéo invalide.'));return;}resolve(v);};v.onerror=()=>reject(new Error('Cette vidéo ne peut pas être décodée par ton navigateur.'));v.src=url;});}
export async function seek(v:HTMLVideoElement,time:number){if(Math.abs(v.currentTime-time)<0.001&&v.readyState>=2)return;await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>{v.onseeked=null;reject(new Error('La lecture vidéo prend trop de temps.'));},8000);v.onseeked=()=>{clearTimeout(t);v.onseeked=null;resolve();};v.currentTime=time;});}
async function webp(c:HTMLCanvasElement,quality:number):Promise<Blob>{const b=await new Promise<Blob|null>(r=>c.toBlob(r,'image/webp',quality));if(!b||b.type!=='image/webp')throw new Error('L’export WebP nécessite un navigateur récent, comme Chrome, Edge ou Safari.');return b;}
function u24(n:number){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255]);}
function concat(parts:Uint8Array[]){const b=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let i=0;for(const p of parts){b.set(p,i);i+=p.length;}return b;}
function chunk(type:string,data:Uint8Array){const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,data.length,true);return concat([new TextEncoder().encode(type),size,data,...(data.length%2?[new Uint8Array(1)]:[])]);}
export function muxWebp(frames:{bytes:Uint8Array;duration:number}[]):Blob{
 const vp8x=concat([new Uint8Array([0x12,0,0,0]),u24(511),u24(511)]);const anim=new Uint8Array(6);const parts=[chunk('VP8X',vp8x),chunk('ANIM',anim)];
 for(const f of frames){const sub:Uint8Array[]=[];for(let at=12;at+8<=f.bytes.length;){const name=String.fromCharCode(...f.bytes.slice(at,at+4));const size=new DataView(f.bytes.buffer,f.bytes.byteOffset+at+4,4).getUint32(0,true);if(size>f.bytes.length-at-8)throw new Error('Image WebP invalide.');if(['ALPH','VP8 ','VP8L'].includes(name))sub.push(f.bytes.slice(at,at+8+size+(size%2)));at+=8+size+(size%2);}parts.push(chunk('ANMF',concat([u24(0),u24(0),u24(511),u24(511),u24(Math.max(8,Math.round(f.duration))),new Uint8Array([2]),...sub])));}
 const content=concat([new TextEncoder().encode('WEBP'),...parts]);const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,content.length,true);return new Blob([concat([new TextEncoder().encode('RIFF'),size,content]) as BlobPart],{type:'image/webp'});
}
export async function convert(blob:Blob,o:EditOptions,onProgress:(n:number)=>void):Promise<{blob:Blob;animated:boolean}>{
 const url=URL.createObjectURL(blob),c=canvas();
 try{
 const isVideo=blob.type.startsWith('video/'),isGif=blob.type==='image/gif';
 if(!o.animated||(!isVideo&&!isGif)){
  if(isVideo){const v=await loadVideo(url);await seek(v,Math.min(o.start,v.duration-0.01));paint(c,v,v.videoWidth,v.videoHeight,o);v.removeAttribute('src');v.load();}else{const i=await loadImage(url);paint(c,i,i.naturalWidth,i.naturalHeight,o);}
  for(const q of [.9,.75,.55,.35,.18]){const result=await webp(c,q);if(result.size<=100*1024)return{blob:result,animated:false};}throw new Error('L’image dépasse 100 Ko. Réduis le zoom ou simplifie le fond.');
 }
 let frameAt:(time:number)=>Promise<{source:CanvasImageSource;w:number;h:number}>;let duration=0;let cleanup=()=>{};
 if(isVideo){const v=await loadVideo(url);duration=v.duration;frameAt=async(t)=>{await seek(v,Math.min(t,v.duration-.01));return{source:v,w:v.videoWidth,h:v.videoHeight};};cleanup=()=>{v.removeAttribute('src');v.load();};}
 else{
  const {parseGIF,decompressFrames}=await import('gifuct-js');const gif=parseGIF(await blob.arrayBuffer());const w=gif.lsd.width,h=gif.lsd.height;
  if(w*h>1920*1080||gif.frames.length*w*h>80_000_000)throw new Error('Ce GIF est trop volumineux à animer. Essaie un GIF plus court ou choisis « Image fixe ».');
  const frames=decompressFrames(gif,true);if(!frames.length)throw new Error('GIF vide.');
  const surface=document.createElement('canvas');surface.width=w;surface.height=h;const ctx=surface.getContext('2d')!;const rendered:{source:HTMLCanvasElement;end:number}[]=[];let elapsed=0;
  let previous:typeof frames[0]|undefined;let snapshot:ImageData|undefined;
  for(const frame of frames){if(previous?.disposalType===2)ctx.clearRect(previous.dims.left,previous.dims.top,previous.dims.width,previous.dims.height);else if(previous?.disposalType===3&&snapshot)ctx.putImageData(snapshot,0,0);snapshot=frame.disposalType===3?ctx.getImageData(0,0,w,h):undefined;
   const patch=document.createElement('canvas');patch.width=frame.dims.width;patch.height=frame.dims.height;patch.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.patch),frame.dims.width,frame.dims.height),0,0);ctx.drawImage(patch,frame.dims.left,frame.dims.top);
   const copy=document.createElement('canvas');copy.width=w;copy.height=h;copy.getContext('2d')!.drawImage(surface,0,0);elapsed+=Math.max(20,frame.delay||100);rendered.push({source:copy,end:elapsed});previous=frame;
  }duration=elapsed/1000;frameAt=async(t)=>({source:(rendered.find(f=>f.end>t*1000)??rendered[rendered.length-1]).source,w,h});
 }
 try{
  const start=Math.min(Math.max(0,o.start),Math.max(0,duration-.1)),length=Math.min(o.duration,6,duration-start);if(length<=0)throw new Error('Choisis une durée d’animation valide.');
  for(let pass=0;pass<3;pass++){const fps=[12,8,5][pass],quality=[.68,.42,.22][pass];const count=Math.max(2,Math.ceil(length*fps)),frames:{bytes:Uint8Array;duration:number}[]=[];
   for(let i=0;i<count;i++){const f=await frameAt(start+(i/count)*length);paint(c,f.source,f.w,f.h,o);frames.push({bytes:new Uint8Array(await(await webp(c,quality)).arrayBuffer()),duration:length*1000/count});onProgress(Math.round(((pass+i/count)/3)*100));}
   const result=muxWebp(frames);if(result.size<=500*1024){onProgress(100);return{blob:result,animated:true};}
  }throw new Error('L’animation dépasse 500 Ko. Essaie une durée plus courte ou « Image fixe ».');
 }finally{cleanup();}
 }finally{URL.revokeObjectURL(url);}
}
