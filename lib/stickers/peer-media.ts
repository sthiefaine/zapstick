/** Home media can take turns without clearing unrelated audio registrations. */
const peers=new Map<symbol,()=>void>();

export function registerPeerMedia(owner:symbol,stop:()=>void):()=>void{
 peers.set(owner,stop);
 return()=>{if(peers.get(owner)===stop)peers.delete(owner);};
}

export function claimPeerMedia(owner:symbol):void{
 for(const [peer,stop] of [...peers])if(peer!==owner){
  try{stop();}catch{/* A detached player must not prevent the next one. */}
 }
}
