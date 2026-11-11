export type ClipboardReadOptions={secure:boolean;readText?:()=>Promise<string>;signal?:AbortSignal};
const aborted=()=>new DOMException('Aborted','AbortError');
function waitForClipboard(readText:()=>Promise<string>,signal?:AbortSignal):Promise<string>{
 if(signal?.aborted)return Promise.reject(aborted());
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(value:string|undefined,error?:unknown,failed=false)=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);if(failed)reject(error);else resolve(value??'');};
  const cancel=()=>finish(undefined,aborted(),true);
  signal?.addEventListener('abort',cancel,{once:true});
  // Invoke synchronously inside the click's user activation, before any await.
  try{Promise.resolve(readText()).then(value=>finish(value),error=>finish(undefined,error,true));}catch(error){finish(undefined,error,true);}
 });
}
/** Read only from an explicit user action. Wait for the browser choice without a deadline. */
export async function readClipboardLink({secure,readText,signal}:ClipboardReadOptions):Promise<string>{
 if(signal?.aborted)throw aborted();
 if(!secure)throw new Error('Le collage automatique nécessite HTTPS. Colle le lien manuellement.');
 if(!readText)throw new Error('Collage automatique indisponible. Colle le lien manuellement.');
 let text:string;
 try{text=await waitForClipboard(readText,signal);}catch{if(signal?.aborted)throw aborted();throw new Error('Accès au presse-papiers refusé. Colle le lien manuellement.');}
 if(signal?.aborted)throw aborted();
 const value=typeof text==='string'?text.trim():'';
 if(!value)throw new Error('Le presse-papiers est vide. Colle un lien manuellement.');
 let url:URL;try{url=new URL(value);}catch{throw new Error('Le presse-papiers ne contient pas de lien HTTPS valide.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||value.length>2048)throw new Error('Le presse-papiers ne contient pas de lien HTTPS valide.');
 return value;
}
/** A session never queues a second read behind a pending permission prompt. */
export function createClipboardReadSession(){
 let pending:Promise<string>|null=null;
 return {
  get pending(){return pending!==null;},
  read(options:ClipboardReadOptions):Promise<string>|null{
   if(pending)return null;
   const result=readClipboardLink(options).finally(()=>{if(pending===result)pending=null;});
   pending=result;return result;
  },
 };
}
