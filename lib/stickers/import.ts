import {allowedMedia,isImportedMedia,limitedBody} from './remote';
export type RemoteMedia={url:string;name:string;mime:string;thumbnail?:string};
const supportedTypes=['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'];
function socialError(code?:string):Error{
 if(code==='busy')return new Error('Trop d’imports en cours. Réessaie dans un instant.');
 if(code==='too_large')return new Error('Ce média dépasse 20 Mo.');
 if(code==='timeout')return new Error('L’import prend trop de temps. Importe le fichier depuis ton appareil.');
 if(code==='expired')return new Error('Le lien du média a expiré. Colle à nouveau le lien de la publication.');
 if(code==='invalid_url')return new Error('Utilise le lien d’une publication publique Instagram ou TikTok.');
 return new Error('Cette publication est inaccessible. Importe le fichier depuis ton appareil.');
}
async function resolveSocialPost(url:URL):Promise<{media:RemoteMedia[];source:string}>{
 let response:Response;
 try{response=await fetch('/api/import/resolve',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({url:url.href}),credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30_000)});}
 catch{return Promise.reject(socialError('timeout'));}
 const data=await response.json().catch(()=>null) as {error?:string;media?:unknown[];source?:unknown}|null;
 if(!response.ok)throw socialError(data?.error);
 if(!data||!Array.isArray(data.media)||!data.media.length||data.media.length>20||typeof data.source!=='string')throw socialError();
 const media:RemoteMedia[]=data.media.map(raw=>{
  const item=raw as Partial<RemoteMedia>|null;
  if(!item||typeof item!=='object'||typeof item.url!=='string'||!isImportedMedia(item.url)||typeof item.name!=='string'||item.name.length>120||typeof item.mime!=='string'||!supportedTypes.includes(item.mime)||item.thumbnail!==undefined&&(typeof item.thumbnail!=='string'||!isImportedMedia(item.thumbnail)))throw socialError();
  return{url:item.url,name:item.name,mime:item.mime,...(item.thumbnail?{thumbnail:item.thumbnail}:{})};
 });
 return{media,source:data.source};
}
export async function resolveImport(input:string):Promise<{media:RemoteMedia[];source:string}>{
 let url:URL;try{url=new URL(input);}catch{throw new Error('Adresse invalide. Utilisez un lien HTTPS complet.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||input.length>2048)throw new Error('Utilisez un lien HTTPS valide.');
 if(['instagram.com','www.instagram.com','tiktok.com','www.tiktok.com','vm.tiktok.com','vt.tiktok.com'].includes(url.hostname))return resolveSocialPost(url);
 if(['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com','fixupx.com','fxtwitter.com'].includes(url.hostname)){
  const id=url.pathname.match(/\/(?:status|statuses)\/(\d{10,22})(?:\/|$)/)?.[1];if(!id)throw new Error('Utilisez le lien d’une publication X contenant /status/.');
  let response:Response;try{response=await fetch(`https://api.fxtwitter.com/2/status/${id}`,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});}catch{throw new Error('FxTwitter est inaccessible depuis ce navigateur. Importez le fichier depuis votre appareil.');}
  if(!response.ok)throw new Error('FxTwitter est momentanément indisponible. Importez le fichier depuis votre appareil.');
  const data=await response.json() as any,post=data.status??data.tweet;
  if(data.code!==200||!post)throw new Error('Publication privée, supprimée ou indisponible.');
  const media=(post.media?.all??[]).filter((m:any)=>allowedMedia(m.url)).map((m:any,i:number)=>({url:m.url,thumbnail:allowedMedia(m.thumbnail_url||m.url)?.href,name:`${post.author?.screen_name??'X'} · ${m.type==='photo'?'image':'animation'} ${i+1}`,mime:m.type==='photo'?'image/jpeg':'video/mp4'}));
  if(!media.length)throw new Error('Aucun média accessible dans cette publication.');return{media,source:url.href};
 }
 if(!allowedMedia(input))throw new Error('Utilise une publication publique X, Instagram ou TikTok, ou un lien direct X, Giphy ou Tenor.');
 return{media:[{url:url.href,name:'Import',mime:/\.mp4(?:\?|$)/i.test(url.href)?'video/mp4':'image/gif'}],source:url.href};
}
export async function downloadRemote(input:string):Promise<Blob>{
 const local=isImportedMedia(input),url=local?input:allowedMedia(input);if(!url)throw new Error('Source de média non autorisée.');
 let response:Response;try{response=await fetch(url,{mode:local?'same-origin':'cors',credentials:local?'same-origin':'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(30000)});}catch{if(local)throw socialError('timeout');throw new Error('Le média est inaccessible ou son hébergeur bloque l’accès depuis le navigateur. Importez le fichier depuis votre appareil.');}
 if(local&&!response.ok){const data=await response.json().catch(()=>null) as {error?:string}|null;throw socialError(data?.error);}
 if(!response.ok)throw new Error('Le média n’est plus disponible.');
 const type=response.headers.get('content-type')?.split(';')[0]??'';
 if(!supportedTypes.includes(type))throw new Error('Format de média non pris en charge.');
 return limitedBody(response);
}
