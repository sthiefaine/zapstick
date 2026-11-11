import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const require=createRequire(import.meta.url),sharp=require('sharp'),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),cache=new Map();
function loadTS(file){const absolute=path.resolve(root,file);if(cache.has(absolute))return cache.get(absolute).exports;const module={exports:{}};cache.set(absolute,module);const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const localRequire=specifier=>specifier.startsWith('.')?loadTS(path.resolve(path.dirname(absolute),specifier+(path.extname(specifier)?'':'.ts'))):require(specifier);new Function('require','module','exports',code)(localRequire,module,module.exports);return module.exports;}
const {createAnimationPreview}=loadTS('lib/stickers/animation-preview.ts'),{convert,defaults,loadVideo,loadImage,seek}=loadTS('lib/stickers/convert.ts'),{muxWebp}=loadTS('lib/stickers/webp-mux.ts'),{parseWebpAnimation,decodeWebpFrames}=loadTS('lib/stickers/webp-animation.ts'),{inferMediaKind}=loadTS('lib/stickers/media-kind.ts');
const solid=(width,height,color)=>new Uint8ClampedArray(Array.from({length:width*height},()=>color).flat());
const pixel=(rgba,width,x,y)=>Array.from(rgba.slice((y*width+x)*4,(y*width+x)*4+4));
function chunk(name,data){const header=Buffer.alloc(8);header.write(name);header.writeUInt32LE(data.length,4);return Buffer.concat([header,data,...(data.length%2?[Buffer.alloc(1)]:[])]);}
function u24(buffer,at,value){buffer[at]=value&255;buffer[at+1]=value>>>8&255;buffer[at+2]=value>>>16&255;}
async function still(width,height,color){return sharp(solid(width,height,color),{raw:{width,height,channels:4}}).webp({lossless:true}).toBuffer();}
function animatedWebp(frames,width=4,height=4,loop=2){
 const vp8x=Buffer.alloc(10);vp8x[0]=0x12;u24(vp8x,4,width-1);u24(vp8x,7,height-1);const anim=Buffer.alloc(6);anim.writeUInt16LE(loop,4);const parts=[chunk('VP8X',vp8x),chunk('ANIM',anim)];
 for(const frame of frames){const meta=Buffer.alloc(16);u24(meta,0,(frame.x??0)/2);u24(meta,3,(frame.y??0)/2);u24(meta,6,frame.width-1);u24(meta,9,frame.height-1);u24(meta,12,frame.delay??100);meta[15]=(frame.dispose?1:0)|(frame.blend?0:2);const payload=[];for(let at=12;at+8<=frame.webp.length;){const size=frame.webp.readUInt32LE(at+4),end=at+8+size+size%2;if(['ALPH','VP8 ','VP8L'].includes(frame.webp.subarray(at,at+4).toString()))payload.push(frame.webp.subarray(at,end));at=end;}parts.push(chunk('ANMF',Buffer.concat([meta,...payload])));}
 const body=Buffer.concat([Buffer.from('WEBP'),...parts]),header=Buffer.alloc(8);header.write('RIFF');header.writeUInt32LE(body.length,4);return new Blob([header,body],{type:'image/webp'});
}
async function fixture(delay=100){return animatedWebp([{width:2,height:2,webp:await still(2,2,[255,0,0,255]),delay},{width:2,height:2,x:2,blend:true,dispose:true,webp:await still(2,2,[0,0,255,128]),delay},{width:2,height:2,y:2,webp:await still(2,2,[0,255,0,255]),delay}]);}

// A raster adapter delegates real WebP bytes to libwebp, while production seeking,
// compositing, trimming, painting and muxing remain untouched.
class RasterCanvas{
 _width=0;_height=0;data=new Uint8ClampedArray();
 constructor(width=300,height=150){this.width=width;this.height=height;}
 get width(){return this._width;}set width(value){this._width=value;this.data=new Uint8ClampedArray(this._width*this._height*4);}
 get height(){return this._height;}set height(value){this._height=value;this.data=new Uint8ClampedArray(this._width*this._height*4);}
 getContext(){const canvas=this,stack=[];let matrix=[1,0,0,1,0,0];return{
  fillStyle:'#000000',save(){stack.push([...matrix]);},restore(){matrix=stack.pop()??[1,0,0,1,0,0];},translate(x,y){matrix[4]+=matrix[0]*x+matrix[2]*y;matrix[5]+=matrix[1]*x+matrix[3]*y;},rotate(angle){const [a,b,c,d,e,f]=matrix,cos=Math.cos(angle),sin=Math.sin(angle);matrix=[a*cos+c*sin,b*cos+d*sin,c*cos-a*sin,d*cos-b*sin,e,f];},
  clearRect(x,y,width,height){for(let j=Math.max(0,y);j<Math.min(canvas.height,y+height);j++)for(let i=Math.max(0,x);i<Math.min(canvas.width,x+width);i++)canvas.data.fill(0,(j*canvas.width+i)*4,(j*canvas.width+i)*4+4);},
  fillRect(x,y,width,height){const values=this.fillStyle.startsWith('#')?[parseInt(this.fillStyle.slice(1,3),16),parseInt(this.fillStyle.slice(3,5),16),parseInt(this.fillStyle.slice(5,7),16),255]:this.fillStyle.match(/[\d.]+/g).map(Number).map((value,index)=>index===3?Math.round(value*255):value);for(let j=y;j<y+height;j++)for(let i=x;i<x+width;i++)canvas.data.set(values,(j*canvas.width+i)*4);},
  drawImage(source,x,y,width=source.width,height=source.height){for(let j=0;j<height;j++)for(let i=0;i<width;i++){const toX=Math.floor(matrix[0]*(x+i)+matrix[2]*(y+j)+matrix[4]),toY=Math.floor(matrix[1]*(x+i)+matrix[3]*(y+j)+matrix[5]);if(toX<0||toY<0||toX>=canvas.width||toY>=canvas.height)continue;const from=(Math.floor(j*source.height/height)*source.width+Math.floor(i*source.width/width))*4,to=(toY*canvas.width+toX)*4,alpha=source.data[from+3]/255,old=canvas.data[to+3]/255,blended=alpha+old*(1-alpha);for(let c=0;c<3;c++)canvas.data[to+c]=blended?Math.round((source.data[from+c]*alpha+canvas.data[to+c]*old*(1-alpha))/blended):0;canvas.data[to+3]=Math.round(blended*255);}},
  getImageData(){return{data:canvas.data.slice()};},
 };}
 toDataURL(){return'data:image/webp;base64,'+Buffer.from(this.data).toString('base64');}
 toBlob(callback,mime,quality){sharp(Buffer.from(this.data),{raw:{width:this.width,height:this.height,channels:4}}).webp({quality:Math.max(1,Math.round(quality*100)),effort:0}).toBuffer().then(bytes=>callback(new Blob([bytes],{type:mime})));}
}
function browserRaster(){
 const originals={document:globalThis.document,OffscreenCanvas:globalThis.OffscreenCanvas,createImageBitmap:globalThis.createImageBitmap},surfaces=[];let live=0,maxLive=0;
 globalThis.document={createElement(type){assert.equal(type,'canvas');return new RasterCanvas();}};
 globalThis.OffscreenCanvas=class extends RasterCanvas{constructor(width,height){super(width,height);surfaces.push(this);}};
 globalThis.createImageBitmap=async blob=>{const{data,info}=await sharp(Buffer.from(await blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});live++;maxLive=Math.max(maxLive,live);return{width:info.width,height:info.height,data,close(){live--;}};};
 return{surfaces,get live(){return live;},get maxLive(){return maxLive;},restore(){Object.assign(globalThis,originals);}};
}
test('real animated WebP preview seeks backward, forward and through another loop with exact alpha/disposal',async()=>{
 const env=browserRaster();try{
  const controller=new AbortController(),preview=await createAnimationPreview(await fixture(),controller.signal),target=new RasterCanvas(0,0);
  assert.equal(preview.duration,.3);assert.equal(preview.loopCount,2);assert.equal(preview.thumbnails.length,8);
  await preview.drawAt(target,.15);assert.deepEqual(pixel(target.data,4,0,0),[255,0,0,255]);assert.deepEqual(pixel(target.data,4,2,0),[0,0,255,128]);
  await preview.drawAt(target,.25);assert.equal(pixel(target.data,4,2,0)[3],0);assert.deepEqual(pixel(target.data,4,0,2),[0,255,0,255]);
  await preview.drawAt(target,.01);assert.deepEqual(pixel(target.data,4,0,0),[255,0,0,255]);assert.equal(pixel(target.data,4,0,2)[3],0);
  await preview.drawAt(target,.15);assert.deepEqual(pixel(target.data,4,2,0),[0,0,255,128]);assert.equal(env.maxLive,1);assert.equal(env.live,0);
  controller.abort();await assert.rejects(preview.drawAt(target,0),{name:'AbortError'});await new Promise(resolve=>setImmediate(resolve));assert.ok(env.surfaces.every(surface=>surface.width===0&&surface.height===0));preview.dispose();
 }finally{env.restore();}
});
test('WebP conversion trims the selected moments, preserves transparency and finite loops, and captures a fixed frame',async()=>{
 const env=browserRaster();try{
  const input=await fixture(),progress=[],result=await convert(input,{...defaults,start:.18,duration:.12},value=>progress.push(value));
  assert.equal(result.animated,true);assert.ok(result.blob.size<=500*1024);assert.equal(progress.at(-1),100);
  const bytes=new Uint8Array(await result.blob.arrayBuffer()),animation=parseWebpAnimation(bytes);assert.equal(animation.width,512);assert.equal(animation.height,512);assert.equal(animation.loopCount,2);assert.equal(animation.frames.reduce((sum,frame)=>sum+frame.durationMs,0),120);
  const decoded=[];for await(const frame of decodeWebpFrames(bytes,animation))decoded.push(frame.canvas.data.slice());
  assert.equal(decoded.length,2);assert.ok(pixel(decoded[0],512,400,40)[2]>180);assert.ok(Math.abs(pixel(decoded[0],512,400,40)[3]-128)<=1);assert.equal(pixel(decoded[1],512,400,40)[3],0);assert.ok(pixel(decoded[1],512,40,400)[1]>180);
  const fixed=await convert(input,{...defaults,animated:false,start:.25},()=>{}),{data,info}=await sharp(Buffer.from(await fixed.blob.arrayBuffer())).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(fixed.animated,false);assert.ok(fixed.blob.size<=100*1024);assert.equal(info.width,512);assert.equal(pixel(data,512,400,40)[3],0);assert.ok(pixel(data,512,40,400)[1]>180);assert.equal(env.live,0);assert.ok(env.surfaces.every(surface=>surface.width===0));
 }finally{env.restore();}
});
test('animated WebP export still caps a long selection at six seconds',async()=>{
 const env=browserRaster();try{const result=await convert(await fixture(3000),{...defaults,duration:50},()=>{}),animation=parseWebpAnimation(new Uint8Array(await result.blob.arrayBuffer()));assert.ok(result.blob.size<=500*1024);assert.equal(animation.frames.reduce((sum,frame)=>sum+frame.durationMs,0),6000);assert.ok(animation.frames.length<=72);}finally{env.restore();}
});
test('cancel during a pending WebP bitmap closes the bitmap and releases all decoder canvases',async()=>{
 const env=browserRaster();try{
  const controller=new AbortController(),preview=await createAnimationPreview(await fixture(),controller.signal,{thumbnails:false}),original=globalThis.createImageBitmap;let grant,startedResolve;const started=new Promise(resolve=>{startedResolve=resolve;});
  globalThis.createImageBitmap=async blob=>{const bitmap=await original(blob);startedResolve();await new Promise(resolve=>{grant=resolve;});return bitmap;};
  const target=new RasterCanvas(0,0),drawing=preview.drawAt(target,.25);await started;const cancelled=assert.rejects(drawing,{name:'AbortError'});controller.abort();await cancelled;grant();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(env.live,0);assert.ok(env.surfaces.every(surface=>surface.width===0));
 }finally{env.restore();}
});
test('explicit preview disposal also rejects an in-flight bitmap read before it completes',async()=>{
 const env=browserRaster();try{
  const preview=await createAnimationPreview(await fixture(),new AbortController().signal,{thumbnails:false}),decode=globalThis.createImageBitmap;let grant,notify;const started=new Promise(resolve=>{notify=resolve;});
  globalThis.createImageBitmap=async blob=>{const bitmap=await decode(blob);notify();await new Promise(resolve=>{grant=resolve;});return bitmap;};
  const drawing=preview.drawAt(new RasterCanvas(0,0),.15);await started;const disposed=assert.rejects(drawing,{name:'AbortError'});preview.dispose();await disposed;grant();await new Promise(resolve=>setTimeout(resolve,10));assert.equal(env.live,0);assert.ok(env.surfaces.every(surface=>surface.width===0));
 }finally{env.restore();}
});
test('pure WebP mux retains actual encoded frames, durations, alpha and loop count',async()=>{
 const red=await still(512,512,[255,0,0,128]),blue=await still(512,512,[0,0,255,0]),blob=muxWebp([{bytes:red,duration:250},{bytes:blue,duration:500}],{loopCount:3}),bytes=new Uint8Array(await blob.arrayBuffer()),animation=parseWebpAnimation(bytes);
 assert.equal(blob.type,'image/webp');assert.equal(animation.loopCount,3);assert.deepEqual(animation.frames.map(frame=>frame.durationMs),[250,500]);assert.equal(animation.frames[0].blend,false);
 const metadata=await sharp(Buffer.from(bytes),{animated:true}).metadata();assert.equal(metadata.pages,2);assert.equal(metadata.hasAlpha,true);
 assert.equal(parseWebpAnimation(new Uint8Array(await muxWebp([{bytes:red,duration:250},{bytes:blue,duration:500}]).arrayBuffer())).loopCount,0);
});
test('media kind inference distinguishes actual still and animated WebP with a bounded header read',async()=>{
 assert.equal(await inferMediaKind(await fixture()),'animated');assert.equal(await inferMediaKind(new Blob([await still(2,2,[0,0,0,255])],{type:'image/webp'})),'static');
 assert.equal(await inferMediaKind(new Blob(['gif'],{type:'image/gif'})),'animated');assert.equal(await inferMediaKind(new Blob(['video'],{type:'video/mp4'})),'animated');
 const blob=await fixture(),calls=[];assert.equal(await inferMediaKind({type:'image/webp',slice(start,end){calls.push([start,end]);return blob.slice(start,end);},arrayBuffer(){throw new Error('must not read the whole media');}}),'animated');assert.deepEqual(calls,[[0,30]]);
 assert.equal(await inferMediaKind(new Blob(['RIFFbad'],{type:'image/webp'})),'static');
});
class PendingVideo{
 duration=8;videoWidth=512;videoHeight=512;currentTime=0;readyState=2;onloadeddata=null;onseeked=null;onerror=null;src='';loads=0;paused=0;
 pause(){this.paused++;}load(){this.loads++;}removeAttribute(name){if(name==='src')this.src='';}
}
test('conversion abort before loadeddata rejects before any progress and releases the media URL',async()=>{
 const originalDocument=globalThis.document,originalRevoke=URL.revokeObjectURL,video=new PendingVideo(),revoked=[];let progress=0;
 globalThis.document={createElement(type){if(type==='canvas')return new RasterCanvas();assert.equal(type,'video');return video;}};URL.revokeObjectURL=url=>{revoked.push(url);originalRevoke(url);};
 try{const controller=new AbortController(),pending=convert(new Blob(['video'],{type:'video/mp4'}),defaults,()=>{progress++;},controller.signal),cancelled=assert.rejects(pending,{name:'AbortError'});controller.abort();await cancelled;assert.equal(progress,0);assert.equal(video.src,'');assert.ok(video.loads>0);assert.equal(revoked.length,1);assert.equal(video.onloadeddata,null);assert.equal(video.onerror,null);}finally{globalThis.document=originalDocument;URL.revokeObjectURL=originalRevoke;}
});
test('video preparation has a real deadline and seek cancellation restores event handlers',async context=>{
 const originalDocument=globalThis.document,video=new PendingVideo();globalThis.document={createElement(){return video;}};context.mock.timers.enable({apis:['setTimeout']});
 try{
  const loading=loadVideo('blob:pending'),expired=assert.rejects(loading,/prend trop de temps/);context.mock.timers.tick(10001);await expired;assert.equal(video.src,'');assert.equal(video.onloadeddata,null);
  const previous=()=>{},controller=new AbortController();video.onseeked=previous;const seeking=seek(video,4,controller.signal),cancelled=assert.rejects(seeking,{name:'AbortError'});controller.abort();await cancelled;assert.equal(video.onseeked,previous);assert.ok(video.paused>0);
 }finally{globalThis.document=originalDocument;}
});
test('fixed-image loading aborts promptly and a pre-aborted conversion allocates no media',async()=>{
 const originalImage=globalThis.Image,originalDocument=globalThis.document;let image;
 globalThis.Image=class{constructor(){image=this;}src='';onload=null;onerror=null;removeAttribute(){this.src='';}};
 try{const controller=new AbortController(),loading=loadImage('blob:pending',controller.signal),cancelled=assert.rejects(loading,{name:'AbortError'});controller.abort();await cancelled;assert.equal(image.src,'');assert.equal(image.onload,null);globalThis.document={createElement(){throw new Error('must not allocate');}};await assert.rejects(convert(new Blob(['image'],{type:'image/png'}),defaults,()=>{},AbortSignal.abort()),{name:'AbortError'});}finally{globalThis.Image=originalImage;globalThis.document=originalDocument;}
});
