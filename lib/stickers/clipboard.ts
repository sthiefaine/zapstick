/** Read only from an explicit user action. No permission probes or polling. */
export async function readClipboardLink({secure,readText}:{secure:boolean;readText?:()=>Promise<string>}):Promise<string>{
 if(!secure)throw new Error('Le collage automatique nécessite HTTPS. Colle le lien manuellement.');
 if(!readText)throw new Error('Collage automatique indisponible. Colle le lien manuellement.');
 let text:string;
 try{text=await readText();}catch{throw new Error('Accès au presse-papiers refusé. Colle le lien manuellement.');}
 const value=typeof text==='string'?text.trim():'';
 if(!value)throw new Error('Le presse-papiers est vide. Colle un lien manuellement.');
 let url:URL;try{url=new URL(value);}catch{throw new Error('Le presse-papiers ne contient pas de lien HTTPS valide.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||value.length>2048)throw new Error('Le presse-papiers ne contient pas de lien HTTPS valide.');
 return value;
}
