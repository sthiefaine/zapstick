function u24(n:number){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255]);}
function concat(parts:Uint8Array[]){const b=new Uint8Array(parts.reduce((s,p)=>s+p.length,0));let i=0;for(const p of parts){b.set(p,i);i+=p.length;}return b;}
function chunk(type:string,data:Uint8Array){const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,data.length,true);return concat([new TextEncoder().encode(type),size,data,...(data.length%2?[new Uint8Array(1)]:[])]);}
export type WebpMuxFrame={bytes:Uint8Array;duration:number};
export function muxWebp(frames:readonly WebpMuxFrame[],{loopCount=0}:{loopCount?:number}={}):Blob{
 const vp8x=concat([new Uint8Array([0x12,0,0,0]),u24(511),u24(511)]);const anim=new Uint8Array(6);new DataView(anim.buffer).setUint16(4,Number.isFinite(loopCount)?Math.max(0,Math.min(65535,Math.round(loopCount))):0,true);const parts=[chunk('VP8X',vp8x),chunk('ANIM',anim)];
 for(const f of frames){const sub:Uint8Array[]=[];for(let at=12;at+8<=f.bytes.length;){const name=String.fromCharCode(...f.bytes.slice(at,at+4));const size=new DataView(f.bytes.buffer,f.bytes.byteOffset+at+4,4).getUint32(0,true);if(size>f.bytes.length-at-8)throw new Error('Image WebP invalide.');if(['ALPH','VP8 ','VP8L'].includes(name))sub.push(f.bytes.slice(at,at+8+size+(size%2)));at+=8+size+(size%2);}parts.push(chunk('ANMF',concat([u24(0),u24(0),u24(511),u24(511),u24(Math.max(8,Math.round(f.duration))),new Uint8Array([2]),...sub])));}
 const content=concat([new TextEncoder().encode('WEBP'),...parts]);const size=new Uint8Array(4);new DataView(size.buffer).setUint32(0,content.length,true);return new Blob([concat([new TextEncoder().encode('RIFF'),size,content]) as BlobPart],{type:'image/webp'});
}
