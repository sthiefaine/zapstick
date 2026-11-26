import {handleSocialImport} from '@/lib/server/social-import';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const GET=handleSocialImport;
export function HEAD(){return Response.json({error:'unavailable'},{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});}
