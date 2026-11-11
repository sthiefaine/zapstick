import {allowedMedia,limitedBody} from '@/lib/stickers/remote';
export async function GET(request:Request){
  try{const url=allowedMedia(new URL(request.url).searchParams.get('url')??'');if(!url)return Response.json({error:'Source de média non autorisée.'},{status:400});
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error('Le média n’est plus disponible. Importe le fichier depuis ton appareil.');
    const type=response.headers.get('content-type')?.split(';')[0]??'';
    if(!['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'].includes(type))throw new Error('Ce format de média n’est pas pris en charge.');
    const blob=await limitedBody(response);return new Response(blob,{headers:{'Content-Type':type,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Téléchargement impossible.'},{status:400});}
}
