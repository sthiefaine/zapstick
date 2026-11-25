/** Deliberately limited to MyInstants. This is not a general media proxy. */
export const AUDIO_IMPORT_LIMITS=Object.freeze({htmlBytes:512*1024,audioBytes:5*1024*1024,timeoutMs:15_000,redirects:2,concurrent:2});
export type AudioImportCode='invalid_url'|'unavailable'|'too_large'|'timeout'|'busy'|'not_audio';
export class AudioImportError extends Error{
 constructor(public readonly code:AudioImportCode){super(code);this.name='AudioImportError';}
}
type Kind='page'|'audio';
type Source={url:URL;kind:Kind};
type Fetcher=typeof fetch;
type Options={signal?:AbortSignal;fetcher?:Fetcher;timeoutMs?:number};
const hosts=new Set(['myinstants.com','www.myinstants.com']);
const audioPath=/^\/media\/sounds\/[^/\\]{1,512}\.(?:mp3|wav|ogg|m4a)$/i;
const pagePath=/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?instant\/[^/\\]{1,512}\/?$/i;
const fail=(code:AudioImportCode):never=>{throw new AudioImportError(code);};
export function validateMyInstantsUrl(raw:string):Source{
 if(typeof raw!=='string'||!raw||raw.length>1800||/[\\\x00-\x20\x7f]/.test(raw))return fail('invalid_url');
 let url:URL;try{url=new URL(raw);}catch{return fail('invalid_url');}
 if(url.protocol!=='https:'||!hosts.has(url.hostname)||url.username||url.password||(url.port&&url.port!=='443')||url.href.length>1800||/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname))return fail('invalid_url');
 const kind=audioPath.test(url.pathname)?'audio':pagePath.test(url.pathname)?'page':null;
 if(!kind)return fail('invalid_url');
 url.search='';url.hash='';
 return{url,kind};
}
function entities(value:string):string{
 return value.replace(/&(?:amp|quot|apos|lt|gt|#(?:x[0-9a-f]+|\d+));/gi,entity=>{
  const basic:Record<string,string>={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
  const key=entity.toLowerCase();if(basic[key])return basic[key];
  const hex=key.startsWith('&#x'),point=Number.parseInt(key.slice(hex?3:2,-1),hex?16:10);
  return Number.isInteger(point)&&point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):'';
 });
}
function cleanName(value:string):string{return entities(value).replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s*[-|]\s*Myinstants.*$/i,'').replace(/\s+/g,' ').trim().slice(0,120)||'MyInstants';}
function attributes(tag:string):Record<string,string>{
 const out:Record<string,string>=Object.create(null);
 for(const match of tag.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g))out[match[1].toLowerCase()]=entities(match[2]??match[3]??match[4]??'');
 return out;
}
/** Read static attributes as data. Event handler strings are never executed. */
export function extractMyInstantsAudio(html:string,base:URL):{source:Source;name:string}{
 const primary:string[]=[],downloads:string[]=[],sources:string[]=[];
 let title='';
 for(const match of html.matchAll(/<(?:button|a|audio|source|meta)\b[^>]{0,8192}>/gi)){
  const tag=match[0],attrs=attributes(tag);
  if(attrs.property==='og:title')title=attrs.content??title;
  if(/^instant-page-button(?:-element)?$/i.test(attrs.id??'')){
   if(attrs['data-url'])primary.push(attrs['data-url']);
   else if(attrs.onclick){const path=attrs.onclick.match(/(?:['"])((?:https:\/\/[^'"\s]+|\/media\/sounds\/[^'"\s]+)\.(?:mp3|wav|ogg|m4a)(?:\?[^'"\s]*)?)(?:['"])/i)?.[1];if(path)primary.push(path);}
  }
  if(/^<a\b/i.test(tag)&&/\bdownload(?:\s|=|>)/i.test(tag)&&attrs.href)downloads.push(attrs.href);
  if(/^<(?:audio|source)\b/i.test(tag)&&attrs.src)sources.push(attrs.src);
  if(/^og:audio(?::(?:url|secure_url))?$/.test(attrs.property??'')&&attrs.content)sources.push(attrs.content);
 }
 const candidate=primary[0]??downloads[0]??sources[0];
 if(!candidate)return fail('not_audio');
 let raw:string;try{raw=new URL(candidate,base).href;}catch{return fail('invalid_url');}
 const source=validateMyInstantsUrl(raw);if(source.kind!=='audio')return fail('invalid_url');
 if(!title)title=html.match(/<title\b[^>]*>([^<]{0,8192})<\/title>/i)?.[1]??'';
 let fallback=source.url.pathname.split('/').at(-1)??'MyInstants';try{fallback=decodeURIComponent(fallback);}catch{/* Keep the encoded filename. */}
 return{source,name:cleanName(title||fallback.replace(/\.(mp3|wav|ogg|m4a)$/i,''))};
}
const ascii=(bytes:Uint8Array,at:number,length:number)=>String.fromCharCode(...bytes.subarray(at,at+length));
function mp3Frame(bytes:Uint8Array,at:number):number{
 if(at+4>bytes.length||bytes[at]!==255||(bytes[at+1]&224)!==224)return 0;
 const version=(bytes[at+1]>>3)&3,layer=(bytes[at+1]>>1)&3,bitrateIndex=bytes[at+2]>>4,rateIndex=(bytes[at+2]>>2)&3;
 if(version===1||layer!==1||!bitrateIndex||bitrateIndex===15||rateIndex===3)return 0;
 const bitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bitrateIndex]*1000;
 const rate=[44100,48000,32000][rateIndex]/(version===3?1:version===2?2:4);
 return Math.floor((version===3?144:72)*bitrate/rate)+((bytes[at+2]>>1)&1);
}
/** Bounded container/signature checks; the browser performs the full decode. */
export function sniffAudio(bytes:Uint8Array):string|null{
 if(bytes.length<16)return null;
 let mp3Start=0;
 if(ascii(bytes,0,3)==='ID3'){
  if(![2,3,4].includes(bytes[3])||bytes.subarray(6,10).some(value=>value>127))return null;
  mp3Start=10+(bytes[6]<<21)+(bytes[7]<<14)+(bytes[8]<<7)+bytes[9]+(bytes[3]===4&&(bytes[5]&16)?10:0);
 }
 for(let at=mp3Start;at<Math.min(bytes.length-4,mp3Start+4096);at++){
  const frame=mp3Frame(bytes,at),second=frame?mp3Frame(bytes,at+frame):0;if(second&&at+frame+second<=bytes.length)return'audio/mpeg';
 }
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WAVE'&&bytes.length>=44){
  const end=view.getUint32(4,true)+8;if(end>bytes.length||end<44)return null;
  let format=false,data=false,chunks=0;
  for(let at=12;at+8<=end&&chunks++<512;){const size=view.getUint32(at+4,true),next=at+8+size;if(next>end)return null;
   const type=ascii(bytes,at,4);if(type==='fmt '&&size>=16)format=view.getUint16(at+10,true)>0&&view.getUint32(at+12,true)>0;
   if(type==='data'&&size>0)data=true;at=next+(size%2);
  }
  if(format&&data)return'audio/wav';
 }
 if(ascii(bytes,0,4)==='OggS'&&bytes[4]===0&&bytes.length>=28){
  const segments=bytes[26],start=27+segments,size=bytes.subarray(27,start).reduce((sum,value)=>sum+value,0);
  if(segments&&start+size<=bytes.length&&(ascii(bytes,start,8)==='OpusHead'||bytes[start]===1&&ascii(bytes,start+1,6)==='vorbis'))return'audio/ogg';
 }
 if(ascii(bytes,4,4)==='ftyp'){
  let sound=false,video=false,media=false,boxes=0,valid=true;
  function walk(from:number,end:number,depth:number){
   if(depth>8){valid=false;return;}
   for(let at=from;at+8<=end;){
    if(++boxes>1024){valid=false;return;}
    let size=view.getUint32(at),header=8;
    if(size===1){if(at+16>end){valid=false;return;}const high=view.getUint32(at+8),low=view.getUint32(at+12);if(high){valid=false;return;}size=low;header=16;}
    if(size===0)size=end-at;
    if(size<header||at+size>end){valid=false;return;}
    const type=ascii(bytes,at+4,4);
    if(type==='hdlr'&&size>=header+12){const handler=ascii(bytes,at+header+8,4);sound||=handler==='soun';video||=handler==='vide';}
    if(type==='mdat'&&size>header)media=true;
    if(['moov','trak','mdia','minf','stbl'].includes(type))walk(at+header,at+size,depth+1);
    at+=size;
   }
  }
  walk(0,bytes.length,0);if(valid&&sound&&!video&&media)return'audio/mp4';
 }
 return null;
}
function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
  signal.addEventListener('abort',abort,{once:true});
  promise.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});
 });
}
async function readLimited(response:Response,limit:number,signal:AbortSignal):Promise<Uint8Array<ArrayBuffer>>{
 const length=response.headers.get('content-length');if(length&&Number(length)>limit){void response.body?.cancel().catch(()=>{});return fail('too_large');}
 if(!response.body)return fail('not_audio');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;
 try{
  for(;;){const part=await abortable(reader.read(),signal);if(part.done)break;total+=part.value.length;if(total>limit)return fail('too_large');chunks.push(part.value);}
 }finally{void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* An aborted read can still be pending. */}}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function importMyInstantsAudio(raw:string,{signal:clientSignal,fetcher=fetch,timeoutMs=AUDIO_IMPORT_LIMITS.timeoutMs}:Options={}):Promise<{bytes:Uint8Array<ArrayBuffer>;mime:string;name:string}>{
 const initial=validateMyInstantsUrl(raw),controller=new AbortController(),signal=controller.signal;
 const abort=()=>controller.abort(new AudioImportError('unavailable'));
 if(clientSignal?.aborted)return fail('unavailable');
 clientSignal?.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(new AudioImportError('timeout')),Math.min(timeoutMs,AUDIO_IMPORT_LIMITS.timeoutMs));
 let redirects=0;
 async function resource(source:Source):Promise<{bytes:Uint8Array<ArrayBuffer>;type:string;source:Source}>{
  for(;;){
   const response=await abortable(fetcher(source.url.href,{method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:source.kind==='page'?'text/html':'audio/*, application/octet-stream;q=0.5'},signal}),signal);
   if([301,302,303,307,308].includes(response.status)){
    void response.body?.cancel().catch(()=>{});if(++redirects>AUDIO_IMPORT_LIMITS.redirects)return fail('unavailable');
    const location=response.headers.get('location');if(!location)return fail('unavailable');
    let redirect:string;try{redirect=new URL(location,source.url).href;}catch{return fail('invalid_url');}
    const next=validateMyInstantsUrl(redirect);if(next.kind!==source.kind)return fail('invalid_url');source=next;continue;
   }
   if(response.status===413){void response.body?.cancel().catch(()=>{});return fail('too_large');}
   if(!response.ok){void response.body?.cancel().catch(()=>{});return fail('unavailable');}
   const type=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
   const allowed=source.kind==='page'?['text/html','application/xhtml+xml'].includes(type):type.startsWith('audio/')||['application/octet-stream','binary/octet-stream','application/ogg'].includes(type);
   if(!allowed){void response.body?.cancel().catch(()=>{});return fail('not_audio');}
   return{bytes:await readLimited(response,source.kind==='page'?AUDIO_IMPORT_LIMITS.htmlBytes:AUDIO_IMPORT_LIMITS.audioBytes,signal),type,source};
  }
 }
 try{
  const first=await resource(initial);let audio=first,name='';
  if(initial.kind==='page'){const extracted=extractMyInstantsAudio(new TextDecoder().decode(first.bytes),first.source.url);name=extracted.name;audio=await resource(extracted.source);}
  const mime=sniffAudio(audio.bytes);if(!mime)return fail('not_audio');
  if(!name){let file=audio.source.url.pathname.split('/').at(-1)??'MyInstants';try{file=decodeURIComponent(file);}catch{/* Keep its encoded filename. */}name=cleanName(file.replace(/\.(mp3|wav|ogg|m4a)$/i,''));}
  return{bytes:audio.bytes,mime,name};
 }catch(error){if(signal.aborted)throw signal.reason;if(error instanceof AudioImportError)throw error;return fail('unavailable');}
 finally{clearTimeout(timer);clientSignal?.removeEventListener('abort',abort);}
}
const commonHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Cross-Origin-Resource-Policy':'same-origin'};
const errorStatus:Record<AudioImportCode,number>={invalid_url:400,unavailable:502,too_large:413,timeout:504,busy:429,not_audio:415};
export function createAudioImportHandler(options:Options&{maxConcurrent?:number}={}){
 let active=0;const maximum=Math.min(AUDIO_IMPORT_LIMITS.concurrent,Math.max(1,options.maxConcurrent??AUDIO_IMPORT_LIMITS.concurrent));
 return async(request:Request):Promise<Response>=>{
  if(active>=maximum)return Response.json({error:'busy'},{status:429,headers:{...commonHeaders,'Retry-After':'1'}});
  active++;
  try{
   const url=new URL(request.url);if(url.searchParams.getAll('url').length!==1||Array.from(url.searchParams.keys()).some(key=>key!=='url'))return fail('invalid_url');
   const result=await importMyInstantsAudio(url.searchParams.get('url')??'',{...options,signal:request.signal});
   return new Response(result.bytes,{headers:{...commonHeaders,'Content-Type':result.mime,'Content-Length':String(result.bytes.byteLength),'X-Audio-Name':encodeURIComponent(result.name)}});
  }catch(error){const code=error instanceof AudioImportError?error.code:'unavailable';return Response.json({error:code},{status:errorStatus[code],headers:commonHeaders});}
  finally{active--;}
 };
}
