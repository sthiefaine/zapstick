import {randomBytes} from 'node:crypto';
import {InstagramImportError,instagramMediaUrl,resolveInstagramVideo} from './instagram-import';

/** Only public Instagram/TikTok posts are resolved by the private Cobalt service. */
export const SOCIAL_IMPORT_LIMITS=Object.freeze({requestBytes:2048,jsonBytes:64*1024,mediaBytes:20*1024*1024,timeoutMs:25_000,ticketMs:90_000,concurrent:2,tickets:128,items:20});
type Code='invalid_url'|'unavailable'|'too_large'|'timeout'|'busy'|'not_media'|'expired';
class ImportError extends Error { constructor(readonly code:Code){super(code);} }
type Ticket={url:string;name:string;kind:'image'|'video';expiresAt:number;provider?:'instagram'};
type ResolvedMedia={url:string;name:string;mime:string;thumbnail?:string;provider?:'instagram'};
type State={tickets:Map<string,Ticket>;active:number;tokens:number;updated:number};
type Environment=Record<string,string|undefined>;
type Options={fetcher?:typeof fetch;env?:()=>Environment;state?:State;clock?:()=>number};
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Cross-Origin-Resource-Policy':'same-origin'};
const statuses:Record<Code,number>={invalid_url:400,unavailable:502,too_large:413,timeout:504,busy:429,not_media:415,expired:410};
const fail=(code:Code):never=>{throw new ImportError(code);};
const ticketPath=/^\/api\/import\/media\/([A-Za-z0-9_-]{32})$/;
const newState=():State=>({tickets:new Map(),active:0,tokens:4,updated:Date.now()});
const globalState=globalThis as typeof globalThis&{__zapstickSocialImportState?:State};
const sharedState=globalState.__zapstickSocialImportState??=newState();

export function validateSocialPost(raw:string):{url:URL;service:'instagram'|'tiktok'} {
  if(typeof raw!=='string'||!raw||raw.length>1800||/[\\\x00-\x20\x7f]/.test(raw))return fail('invalid_url');
  let url:URL;try{url=new URL(raw);}catch{return fail('invalid_url');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(url.pathname))return fail('invalid_url');
  let service:'instagram'|'tiktok';
  if(['instagram.com','www.instagram.com'].includes(url.hostname)&&/^\/(?:p|reel|reels|tv|share)\/[A-Za-z0-9_-]{5,64}\/?$/.test(url.pathname)){
    service='instagram';url.hostname='www.instagram.com';
  }else if(['tiktok.com','www.tiktok.com'].includes(url.hostname)&&/^\/(?:@[A-Za-z0-9_.-]{1,100}\/(?:video|photo)\/\d{10,25}|t\/[A-Za-z0-9_-]{5,32})\/?$/.test(url.pathname)){
    service='tiktok';url.hostname='www.tiktok.com';
  }else if(['vm.tiktok.com','vt.tiktok.com'].includes(url.hostname)&&/^\/[A-Za-z0-9_-]{5,32}\/?$/.test(url.pathname))service='tiktok';
  else return fail('invalid_url');
  url.search='';url.hash='';return{url,service};
}
function cobaltConfig(env:Environment):{origin:URL;key?:string}{
  let origin:URL;try{origin=new URL(env.COBALT_API_URL||'');}catch{return fail('unavailable');}
  if(!['http:','https:'].includes(origin.protocol)||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')return fail('unavailable');
  const key=env.COBALT_API_KEY;if(key&&(!/^[A-Za-z0-9_-]{16,256}$/.test(key)))return fail('unavailable');
  return{origin,key};
}
function sameOrigin(request:Request,env:Environment):boolean{
  const site=new URL(env.SITE_URL||request.url).origin,origin=request.headers.get('origin'),fetchSite=request.headers.get('sec-fetch-site');
  return !(origin&&origin!==site||fetchSite&&!['same-origin','none'].includes(fetchSite))&&(request.method==='GET'||origin===site);
}
async function limited(body:ReadableStream<Uint8Array>|null,limit:number,signal:AbortSignal):Promise<Uint8Array<ArrayBuffer>>{
  if(!body)return new Uint8Array();
  const reader=body.getReader(),chunks:Uint8Array[]=[];let length=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    if(signal.aborted)return fail('timeout');
    for(;;){const part=await reader.read();if(signal.aborted)return fail('timeout');if(part.done)break;length+=part.value.length;if(length>limit)return fail('too_large');chunks.push(part.value);}
  }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
}
function proxyTarget(raw:unknown,origin:URL):string{
  if(typeof raw!=='string'||raw.length>4096)return fail('unavailable');
  let url:URL;try{url=new URL(raw);}catch{return fail('unavailable');}
  // Only signed tunnels created by our own service. Never follow its redirects
  // or fetch an arbitrary CDN URL supplied through a public request.
  if(url.origin!==origin.origin||url.pathname!=='/tunnel'||!url.search||url.username||url.password||url.hash)return fail('unavailable');
  return url.href;
}
function mimeFor(name:string,type?:unknown):string{
  if(type==='photo')return'image/jpeg';if(type==='gif')return'image/gif';if(type==='video')return'video/mp4';
  const ext=name.split('.').at(-1)?.toLowerCase();
  return ({mp4:'video/mp4',webm:'video/webm',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'} as Record<string,string>)[ext||'']||fail('not_media');
}
function mediaMime(bytes:Uint8Array):string|null{
  const at=(offset:number,length:number)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
  if(bytes.length<12)return null;
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return'image/jpeg';
  if(bytes[0]===137&&at(1,3)==='PNG'&&bytes[4]===13&&bytes[5]===10)return'image/png';
  if(['GIF87a','GIF89a'].includes(at(0,6)))return'image/gif';
  if(at(0,4)==='RIFF'&&at(8,4)==='WEBP')return'image/webp';
  if(at(4,4)==='ftyp'&&!['avif','avis','heic','heix','mif1','msf1'].includes(at(8,4)))return'video/mp4';
  if(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)return'video/webm';
  return null;
}
async function resolveCobalt(source:{url:URL;service:'instagram'|'tiktok'},config:ReturnType<typeof cobaltConfig>,fetcher:typeof fetch,signal:AbortSignal):Promise<ResolvedMedia[]>{
  const response=await fetcher(config.origin.href,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',...(config.key?{Authorization:`Api-Key ${config.key}`}:{})},body:JSON.stringify({url:source.url.href,alwaysProxy:true,videoQuality:'480',downloadMode:'auto',localProcessing:'disabled',disableMetadata:true}),redirect:'error',cache:'no-store',signal});
  if(!response.ok){void response.body?.cancel().catch(()=>{});return fail(response.status===429?'busy':'unavailable');}
  const data=JSON.parse(new TextDecoder().decode(await limited(response.body,SOCIAL_IMPORT_LIMITS.jsonBytes,signal)));
  if(!data||typeof data!=='object'||data.status==='error')return fail('unavailable');
  const items=data.status==='picker'&&Array.isArray(data.picker)?data.picker:data.status==='tunnel'?[data]:[];
  if(!items.length||items.length>SOCIAL_IMPORT_LIMITS.items)return fail('not_media');
  const resolved:ResolvedMedia[]=items.map((item:{url?:unknown;filename?:unknown;type?:unknown;thumb?:unknown},index:number)=>{
    const url=proxyTarget(item.url,config.origin),name=typeof item.filename==='string'?item.filename.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,120):`${source.service} ${index+1}`;
    return{url,name,mime:mimeFor(name,item.type),...(item.thumb?{thumbnail:proxyTarget(item.thumb,config.origin)}:{})};
  });
  // A Reel's cover is not a successful video import. Mixed carousels remain
  // selectable as long as the service actually recovered their video items.
  if(source.service==='instagram'&&/^\/(?:reels?|tv)\//.test(source.url.pathname)&&!resolved.some(item=>item.mime.startsWith('video/')))return fail('not_media');
  return resolved;
}
export function createSocialImportHandler({fetcher=fetch,env=()=>process.env,state=sharedState,clock=Date.now}:Options={}){
  return async function handle(request:Request):Promise<Response>{
    let admitted=false;
    try{
      const url=new URL(request.url),resolve=url.pathname==='/api/import/resolve',ticket=ticketPath.exec(url.pathname)?.[1];
      if(url.search||!resolve&&!ticket)return Response.json({error:'invalid_url'},{status:404,headers});
      if(request.method!==(resolve?'POST':'GET'))return Response.json({error:'invalid_url'},{status:405,headers:{...headers,Allow:resolve?'POST':'GET'}});
      const environment=env();if(!sameOrigin(request,environment))return Response.json({error:'unavailable'},{status:403,headers});
      const now=clock();for(const [id,item]of state.tickets)if(item.expiresAt<=now)state.tickets.delete(id);
      state.tokens=Math.min(4,state.tokens+Math.max(0,now-state.updated)/15_000);state.updated=now;
      if(state.active>=SOCIAL_IMPORT_LIMITS.concurrent||resolve&&state.tokens<1)return fail('busy');
      if(resolve)state.tokens--;state.active++;admitted=true;
      const config=cobaltConfig(environment),signal=AbortSignal.any([request.signal,AbortSignal.timeout(SOCIAL_IMPORT_LIMITS.timeoutMs)]);
      if(resolve){
        const length=request.headers.get('content-length');
        if(length&&(!/^\d+$/.test(length)||Number(length)>SOCIAL_IMPORT_LIMITS.requestBytes))return fail('too_large');
        if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')||''))return fail('invalid_url');
        const bytes=await limited(request.body,SOCIAL_IMPORT_LIMITS.requestBytes,signal);
        let input:unknown;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return fail('invalid_url');}
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!('url'in input)||typeof input.url!=='string')return fail('invalid_url');
        const source=validateSocialPost(input.url);
        let resolved:ResolvedMedia[];
        try{resolved=await resolveCobalt(source,config,fetcher,signal);}
        catch(error){
          if(source.service!=='instagram'||signal.aborted||error instanceof ImportError&&['busy','too_large','timeout'].includes(error.code))throw error;
          resolved=await resolveInstagramVideo(source.url,signal,environment.INSTAGRAM_DOWNLOADER);
        }
        const pending:{id:string;record:Ticket;mime:string;thumbnail?:string}[]=[];
        const media=resolved.map((item)=>{
          const id=randomBytes(24).toString('base64url');
          const record:Ticket={url:item.url,name:item.name,kind:item.mime.startsWith('video/')?'video':'image',expiresAt:clock()+SOCIAL_IMPORT_LIMITS.ticketMs,...(item.provider?{provider:item.provider}:{})};
          const entry={id,record,mime:item.mime} as typeof pending[number];pending.push(entry);
          if(item.thumbnail){const thumbId=randomBytes(24).toString('base64url');pending.push({id:thumbId,record:{...record,kind:'image',url:item.thumbnail},mime:'image/jpeg'});entry.thumbnail=`/api/import/media/${thumbId}`;}
          return{url:`/api/import/media/${id}`,name:item.name,mime:item.mime,...(entry.thumbnail?{thumbnail:entry.thumbnail}:{})};
        });
        if(state.tickets.size+pending.length>SOCIAL_IMPORT_LIMITS.tickets)return fail('busy');
        for(const item of pending)state.tickets.set(item.id,item.record);
        return Response.json({media,source:source.url.href},{headers});
      }
      const item=state.tickets.get(ticket!);if(!item||item.expiresAt<=clock())return fail('expired');
      const target=item.provider==='instagram'?instagramMediaUrl(item.url):proxyTarget(item.url,config.origin);
      const response=await fetcher(target,{method:'GET',headers:{Accept:'image/*, video/*, application/octet-stream;q=0.5',...(item.provider==='instagram'?{Referer:'https://www.instagram.com/'}:config.key?{Authorization:`Api-Key ${config.key}`}:{})},redirect:'error',cache:'no-store',signal});
      if(!response.ok){void response.body?.cancel().catch(()=>{});return fail(response.status===429?'busy':'unavailable');}
      const length=response.headers.get('content-length');if(length&&Number(length)>SOCIAL_IMPORT_LIMITS.mediaBytes){void response.body?.cancel().catch(()=>{});return fail('too_large');}
      const type=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!type.startsWith('image/')&&!type.startsWith('video/')&&!['application/octet-stream','binary/octet-stream'].includes(type)){void response.body?.cancel().catch(()=>{});return fail('not_media');}
      const bytes=await limited(response.body,SOCIAL_IMPORT_LIMITS.mediaBytes,signal),mime=mediaMime(bytes);if(!mime||!mime.startsWith(item.kind+'/'))return fail('not_media');
      return new Response(bytes,{headers:{...headers,'Content-Type':mime,'Content-Length':String(bytes.byteLength),'Content-Disposition':'inline'}});
    }catch(error){const code:Code=error instanceof ImportError||error instanceof InstagramImportError?error.code:request.signal.aborted||error instanceof DOMException&&['TimeoutError','AbortError'].includes(error.name)?'timeout':'unavailable';return Response.json({error:code},{status:statuses[code],headers:{...headers,...(code==='busy'?{'Retry-After':'5'}:{})}});}
    finally{if(admitted)state.active--;}
  };
}
export const handleSocialImport=createSocialImportHandler();
