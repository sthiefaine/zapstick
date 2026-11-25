import {createAudioImportHandler} from '@/lib/server/audio-import';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
export const GET=createAudioImportHandler();
// Next otherwise derives HEAD from GET and would download a sound needlessly.
export function HEAD(){return Response.json({error:'unavailable'},{status:405,headers:{Allow:'GET','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
