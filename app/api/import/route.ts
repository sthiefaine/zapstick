import { allowedMedia } from '@/lib/stickers/remote';
export async function POST(request:Request){
  try{
    if(Number(request.headers.get('content-length'))>4096)return Response.json({error:'Lien trop long.'},{status:413});
    const body=await request.text();if(body.length>4096)return Response.json({error:'Lien trop long.'},{status:413});
    const {url:input}=JSON.parse(body);if(typeof input!=='string'||input.length>2048)throw new Error('Colle un lien valide de moins de 2 048 caractères.');let url:URL;try{url=new URL(input);}catch{throw new Error('Ce lien n’est pas valide. Colle une adresse complète commençant par https://.');}
    if(url.protocol!=='https:'||url.username||url.password||url.port)throw new Error('Utilise un lien HTTPS valide.');
    if(['x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com','fixupx.com','fxtwitter.com'].includes(url.hostname)){
      const id=url.pathname.match(/\/(?:status|statuses)\/(\d{10,22})(?:\/|$)/)?.[1];if(!id)throw new Error('Colle le lien d’une publication X, contenant /status/.');
      const response=await fetch(`https://api.fxtwitter.com/2/status/${id}`,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'Zapstick/1.0 (+https://zapstick.simonnou-thiefaine.chatgpt.site)'}});
      if(!response.ok)throw new Error('X est momentanément indisponible. Tu peux importer le fichier directement.');
      const data=await response.json() as any;const post=data.tweet??data.status;
      if(data.code!==200||!post)throw new Error('Cette publication est privée, supprimée ou indisponible. Importe plutôt son fichier.');
      const media=(post.media?.all??[]).filter((m:any)=>allowedMedia(m.url)).map((m:any,i:number)=>({url:m.url,thumbnail:allowedMedia(m.thumbnail_url||m.url)?.href,name:`${post.author?.screen_name??'X'} · ${m.type==='photo'?'image':'animation'} ${i+1}`,mime:m.type==='photo'?'image/jpeg':'video/mp4'}));
      if(!media.length)throw new Error('Aucun média accessible dans cette publication.');
      return Response.json({media,source:url.href,author:post.author?.screen_name},{headers:{'Cache-Control':'no-store'}});
    }
    if(!allowedMedia(input))throw new Error('Colle un lien X public, ou un lien direct de média X, Giphy ou Tenor. Pour les autres sites, importe le fichier.');
    return Response.json({media:[{url:url.href,name:'Mon import',mime:/\.mp4(?:\?|$)/i.test(url.href)?'video/mp4':'image/gif'}],source:url.href});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Impossible de lire ce lien.'},{status:400});}
}
