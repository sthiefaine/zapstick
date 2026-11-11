import {allowedMedia,limitedBody} from './remote';
export type RemoteMedia={url:string;name:string;mime:string;thumbnail?:string};
export async function resolveImport(input:string):Promise<{media:RemoteMedia[];source:string}>{
 let url:URL;try{url=new URL(input);}catch{throw new Error('Adresse invalide. Utilisez un lien HTTPS complet.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||input.length>2048)throw new Error('Utilisez un lien HTTPS valide.');
 if(['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com','fixupx.com','fxtwitter.com'].includes(url.hostname)){
  const id=url.pathname.match(/\/(?:status|statuses)\/(\d{10,22})(?:\/|$)/)?.[1];if(!id)throw new Error('Utilisez le lien d’une publication X contenant /status/.');
  let response:Response;try{response=await fetch(`https://api.fxtwitter.com/2/status/${id}`,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});}catch{throw new Error('FxTwitter est inaccessible depuis ce navigateur. Importez le fichier depuis votre appareil.');}
  if(!response.ok)throw new Error('FxTwitter est momentanément indisponible. Importez le fichier depuis votre appareil.');
  const data=await response.json() as any,post=data.status??data.tweet;
  if(data.code!==200||!post)throw new Error('Publication privée, supprimée ou indisponible.');
  const media=(post.media?.all??[]).filter((m:any)=>allowedMedia(m.url)).map((m:any,i:number)=>({url:m.url,thumbnail:allowedMedia(m.thumbnail_url||m.url)?.href,name:`${post.author?.screen_name??'X'} · ${m.type==='photo'?'image':'animation'} ${i+1}`,mime:m.type==='photo'?'image/jpeg':'video/mp4'}));
  if(!media.length)throw new Error('Aucun média accessible dans cette publication.');return{media,source:url.href};
 }
 if(!allowedMedia(input))throw new Error('Utilisez une publication X publique ou un lien direct de média X, Giphy ou Tenor. Pour les autres sites, importez le fichier.');
 return{media:[{url:url.href,name:'Import',mime:/\.mp4(?:\?|$)/i.test(url.href)?'video/mp4':'image/gif'}],source:url.href};
}
export async function downloadRemote(input:string):Promise<Blob>{
 const url=allowedMedia(input);if(!url)throw new Error('Source de média non autorisée.');
 let response:Response;try{response=await fetch(url,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:AbortSignal.timeout(25000)});}catch{throw new Error('Le média est inaccessible ou son hébergeur bloque l’accès depuis le navigateur. Importez le fichier depuis votre appareil.');}
 if(!response.ok)throw new Error('Le média n’est plus disponible.');
 const type=response.headers.get('content-type')?.split(';')[0]??'';
 if(!['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'].includes(type))throw new Error('Format de média non pris en charge.');
 return limitedBody(response);
}
