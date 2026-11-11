export const BACKGROUND_MODEL_CACHE='zapstick-background-model-v1';
export const BACKGROUND_MODEL_URL='https://huggingface.co/BritishWerewolf/U-2-Netp/resolve/7112208dbac3a3642496c8d54e2f0f9bb3dc1dc8/onnx/model.onnx';
export const BACKGROUND_MODEL_BYTES=4574861;
export const BACKGROUND_MODEL_SHA256='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
export const BACKGROUND_MAX_EDGE=1024;
export const BACKGROUND_MAX_PIXELS=16_000_000;
export const BACKGROUND_ANIMATION_LIMITS={edge:512,durationMs:6000,maxFps:8,maxFrames:48,inputBytes:12*1024*1024,encodedBytes:12*1024*1024,timeoutMs:360_000} as const;
export type BackgroundErrorCode='unsupported'|'invalid-image'|'too-large'|'animated'|'download'|'model'|'timeout'|'cancelled'|'busy'|'invalid-animation'|'animation-too-large'|'encoding';
export type BackgroundProgress={stage:'preparing'|'downloading'|'processing';percent?:number};
export class BackgroundRemovalError extends Error{
 constructor(public readonly code:BackgroundErrorCode){super(code);this.name='BackgroundRemovalError';}
}
export function boundedDimensions(width:number,height:number,maxEdge=BACKGROUND_MAX_EDGE){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new BackgroundRemovalError('invalid-image');
 const ratio=Math.min(1,maxEdge/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio))};
}
/** Read dimensions before allocating a decoded camera image. Only static raster formats are accepted. */
export function inspectBackgroundImage(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(start:number,length:number)=>String.fromCharCode(...bytes.subarray(start,start+length));
 let width=0,height=0;
 if(bytes.length>=24&&ascii(1,3)==='PNG'){
  width=view.getUint32(16);height=view.getUint32(20);
  for(let offset=8;offset+12<=bytes.length;){const size=view.getUint32(offset),kind=ascii(offset+4,4);if(kind==='acTL')throw new BackgroundRemovalError('animated');if(kind==='IDAT')break;offset+=12+size;}
 }else if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
  const kind=ascii(12,4);
  if(kind==='VP8X'){if(bytes[20]&2)throw new BackgroundRemovalError('animated');width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);}
  else if(kind==='VP8 '&&bytes[23]===0x9d&&bytes[24]===1&&bytes[25]===0x2a){width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff;}
  else if(kind==='VP8L'&&bytes[20]===0x2f){const bits=view.getUint32(21,true);width=1+(bits&0x3fff);height=1+((bits>>>14)&0x3fff);}
 }else if(bytes[0]===0xff&&bytes[1]===0xd8){
  for(let offset=2;offset+4<=bytes.length;){if(bytes[offset]!==0xff)break;const marker=bytes[offset+1],size=view.getUint16(offset+2);if(size<2||offset+2+size>bytes.length)break;if(size>=7&&[0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){height=view.getUint16(offset+5);width=view.getUint16(offset+7);break;}offset+=size+2;}
 }else if(ascii(0,3)==='GIF')throw new BackgroundRemovalError('animated');
 if(!width||!height)throw new BackgroundRemovalError('invalid-image');
 if(width*height>BACKGROUND_MAX_PIXELS)throw new BackgroundRemovalError('too-large');
 return {width,height};
}
/** Match the upstream U²-Net/rembg RGB normalisation, with CHW layout. */
export function prepareBackgroundTensor(rgba:Uint8ClampedArray|Uint8Array){
 const count=rgba.length/4,result=new Float32Array(count*3),mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225];
 let maximum=1;for(let i=0;i<rgba.length;i+=4)for(let c=0;c<3;c++)maximum=Math.max(maximum,rgba[i+c]);
 for(let i=0;i<count;i++)for(let c=0;c<3;c++)result[c*count+i]=(rgba[4*i+c]/maximum-mean[c])/std[c];
 return result;
}
export function backgroundAlpha(values:Float32Array,target?:Uint8ClampedArray){
 let min=Infinity,max=-Infinity;for(const value of values){if(!Number.isFinite(value))throw new BackgroundRemovalError('model');min=Math.min(min,value);max=Math.max(max,value);}
 if(max-min<1e-6)throw new BackgroundRemovalError('model');
 const rgba=target??new Uint8ClampedArray(values.length*4);if(rgba.length!==values.length*4)throw new BackgroundRemovalError('model');
 for(let i=0;i<values.length;i++){rgba[i*4]=255;rgba[i*4+1]=255;rgba[i*4+2]=255;rgba[i*4+3]=Math.round(255*(values[i]-min)/(max-min));}return rgba;
}

export type BackgroundAnimationSample={sourceIndex:number;durationMs:number};
/** Uniform time slots cap inference at8fps; adjacent slots selecting the same
 * source frame are merged. Integer cumulative endpoints retain the exact loop
 * duration. The final state is sampled too, including a short last source frame. */
export function planBackgroundAnimation(animation:{width:number;height:number;frames:readonly {durationMs:number}[]}){
 if(animation.width!==BACKGROUND_ANIMATION_LIMITS.edge||animation.height!==BACKGROUND_ANIMATION_LIMITS.edge||animation.frames.length<2)throw new BackgroundRemovalError('invalid-animation');
 const ends:number[]=[];let durationMs=0;
 for(const frame of animation.frames){if(!Number.isInteger(frame.durationMs)||frame.durationMs<=0)throw new BackgroundRemovalError('invalid-animation');durationMs+=frame.durationMs;ends.push(durationMs);}
 if(durationMs>BACKGROUND_ANIMATION_LIMITS.durationMs||animation.frames.length>300)throw new BackgroundRemovalError('animation-too-large');
 const slots=Math.min(BACKGROUND_ANIMATION_LIMITS.maxFrames,Math.floor(durationMs*BACKGROUND_ANIMATION_LIMITS.maxFps/1000));
 if(slots<2)throw new BackgroundRemovalError('invalid-animation');
 const samples:BackgroundAnimationSample[]=[];let sourceIndex=0,previousEnd=0;
 for(let slot=0;slot<slots;slot++){
  const time=slot===slots-1?durationMs-.001:slot*durationMs/slots;
  while(sourceIndex<ends.length-1&&ends[sourceIndex]<=time)sourceIndex++;
  const end=Math.round((slot+1)*durationMs/slots),duration=end-previousEnd;previousEnd=end;
  const previous=samples[samples.length-1];if(previous?.sourceIndex===sourceIndex)previous.durationMs+=duration;else samples.push({sourceIndex,durationMs:duration});
 }
 return {durationMs,samples};
}
