const MAX_BYTES=5*1024*1024;
const messages={invalid_url:'Utilise un lien audio HTTPS valide.',unavailable:'Ce son est inaccessible. Importe le fichier depuis ton appareil.',too_large:'Choisis un fichier audio de moins de 5 Mo.',timeout:'Le téléchargement du son prend trop de temps.',busy:'Trop d’imports en cours. Réessaie dans un instant.',not_audio:'Ce lien ne contient pas de son lisible.'} as const;
type Code=keyof typeof messages;
const fail=(code:Code)=>new Error(messages[code]);
/** The browser only follows a user-supplied public HTTPS audio URL on request. */
export function parseAudioUrl(input:string):URL{
 let url:URL;try{url=new URL(input.trim());}catch{throw fail('invalid_url');}
 const host=url.hostname.toLowerCase(),parts=host.split('.').map(Number);
 const privateV4=parts.length===4&&parts.every(v=>Number.isInteger(v)&&v>=0&&v<=255)&&(parts[0]===0||parts[0]===10||parts[0]===127||parts[0]>=224||parts[0]===169&&parts[1]===254||parts[0]===172&&parts[1]>=16&&parts[1]<=31||parts[0]===192&&parts[1]===168||parts[0]===100&&parts[1]>=64&&parts[1]<=127);
 if(input.length>2048||url.protocol!=='https:'||url.username||url.password||url.port||host==='localhost'||!host.includes('.')||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.startsWith('[')||privateV4)throw fail('invalid_url');
 url.hash='';return url;
}
export async function importAudioUrl(input:string,signal:AbortSignal):Promise<{blob:Blob;name:string}>{
 const url=parseAudioUrl(input),relay=['myinstants.com','www.myinstants.com'].includes(url.hostname);
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
 if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');
 signal.addEventListener('abort',abort,{once:true});
 const timer=setTimeout(()=>controller.abort(fail('timeout')),18000);
 try{
  const response=await fetch(relay?`/api/audio?url=${encodeURIComponent(url.href)}`:url.href,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',...(relay?{}:{mode:'cors' as const})});
  if(!response.ok){
   if(relay){const data=await response.json().catch(()=>null) as {error?:unknown}|null;if(typeof data?.error==='string'&&Object.hasOwn(messages,data.error))throw fail(data.error as Code);}
   throw fail('unavailable');
  }
  const mime=(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase();
  if(!mime.startsWith('audio/')&&!['application/octet-stream','application/ogg'].includes(mime)){void response.body?.cancel().catch(()=>{});throw fail('not_audio');}
  if(Number(response.headers.get('content-length'))>MAX_BYTES){void response.body?.cancel().catch(()=>{});throw fail('too_large');}
  const reader=response.body?.getReader();if(!reader)throw fail('not_audio');
  const chunks:Uint8Array<ArrayBuffer>[]= [];let total=0;
  try{for(;;){const{done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES)throw fail('too_large');chunks.push(value as Uint8Array<ArrayBuffer>);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  finally{reader.releaseLock();}
  if(!total)throw fail('not_audio');
  let name='Audio';try{name=decodeURIComponent(response.headers.get('x-audio-name')??url.pathname.split('/').pop()??'Audio').replace(/\.[^.]+$/,'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,120)||'Audio';}catch{/* Use a safe default for malformed upstream names. */}
  return{blob:new Blob(chunks,{type:mime}),name};
 }catch(error){
  if(signal.aborted)throw signal.reason??new DOMException('Aborted','AbortError');
  if(controller.signal.aborted)throw controller.signal.reason;
  if(error instanceof Error&&Object.values(messages).includes(error.message as typeof messages[Code]))throw error;
  throw fail('unavailable');
 }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
