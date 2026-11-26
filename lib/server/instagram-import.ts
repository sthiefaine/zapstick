import {spawn} from 'node:child_process';

type Code='unavailable'|'timeout'|'too_large';
export class InstagramImportError extends Error{constructor(readonly code:Code){super(code);this.name='InstagramImportError';}}
export type InstagramMedia={url:string;name:string;mime:'video/mp4';provider:'instagram'};
const MAX_METADATA=2*1024*1024,MAX_DIAGNOSTICS=16*1024,MAX_MEDIA=20*1024*1024;
const fail=(code:Code='unavailable'):never=>{throw new InstagramImportError(code);};

/** Only Meta's public MP4 media hosts may be fetched; redirects are refused. */
export function instagramMediaUrl(raw:unknown):string{
 if(typeof raw!=='string'||raw.length>8192||/[\\\x00-\x20\x7f]/.test(raw))return fail();
 let url:URL;try{url=new URL(raw);}catch{return fail();}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!url.pathname.toLowerCase().endsWith('.mp4')||!['cdninstagram.com','fbcdn.net'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host)))return fail();
 return url.href;
}

/** Resolve metadata only. No personal cookies, media files or credentials are
 * passed to the child. The existing import quotas also cover this fallback. */
export async function resolveInstagramVideo(url:URL,signal:AbortSignal,command=process.env.INSTAGRAM_DOWNLOADER||(process.env.NODE_ENV==='development'?'yt-dlp':'/opt/zapstick-instagram/bin/yt-dlp')):Promise<InstagramMedia[]>{
 if(signal.aborted)return fail('timeout');
 if(!/^https:\/\/www\.instagram\.com\/(?:p|reels?|tv)\/[A-Za-z0-9_-]{5,64}\/?$/.test(url.href)||command!=='yt-dlp'&&!command.startsWith('/')||command.includes('\0'))return fail();
 const metadata=await new Promise<Buffer>((resolve,reject)=>{
  const child=spawn(command,['--ignore-config','--no-cache-dir','--no-playlist','--skip-download','--no-warnings','--no-progress','--socket-timeout','8','--retries','0','--extractor-retries','0','--use-extractors','Instagram','-f','b[ext=mp4][height<=720]/b[ext=mp4]','--dump-single-json','--',url.href],{shell:false,windowsHide:true,cwd:'/tmp',env:{NODE_ENV:process.env.NODE_ENV??'production',PATH:process.env.PATH??'/usr/local/bin:/usr/bin:/bin',LANG:'C.UTF-8',PYTHONNOUSERSITE:'1'},stdio:['ignore','pipe','pipe']});
  let size=0,diagnostics=0,failure:InstagramImportError|undefined;const parts:Buffer[]=[];
  const stop=(code:Code)=>{failure??=new InstagramImportError(code);child.kill('SIGKILL');};
  const abort=()=>stop('timeout'),timer=setTimeout(abort,20_000);timer.unref();
  signal.addEventListener('abort',abort,{once:true});
  child.on('error',()=>{failure??=new InstagramImportError('unavailable');});
  child.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_METADATA)stop('too_large');else parts.push(chunk);});
  child.stderr.on('data',(chunk:Buffer)=>{diagnostics+=chunk.length;if(diagnostics>MAX_DIAGNOSTICS)stop('unavailable');});
  child.once('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);if(failure||code!==0||!size)reject(failure??new InstagramImportError('unavailable'));else resolve(Buffer.concat(parts,size));});
  if(signal.aborted)abort();
 });
 if(signal.aborted)return fail('timeout');
 let data;try{data=JSON.parse(metadata.toString('utf8'));}catch{return fail();}
 const entries=data?._type==='playlist'?data.entries:[data];
 if(!Array.isArray(entries)||!entries.length||entries.length>20)return fail();
 return entries.map((item,index)=>{
  if(!item||item.ext!=='mp4'||item.requested_formats?.length||item.vcodec==='none'||item.acodec==='none'||typeof item.duration==='number'&&item.duration>120)return fail();
  if(Number(item.filesize||item.filesize_approx)>MAX_MEDIA)return fail('too_large');
  const id=url.pathname.split('/').filter(Boolean).at(-1);
  return{url:instagramMediaUrl(item.url),name:`instagram_${id}${entries.length>1?'_'+(index+1):''}.mp4`,mime:'video/mp4',provider:'instagram'};
 });
}
