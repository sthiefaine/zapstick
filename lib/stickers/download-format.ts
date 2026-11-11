export type DownloadFormat = 'gallery' | 'webp';
type Options = {animated:boolean;isSticker:boolean;format?:DownloadFormat;signal?:AbortSignal;onProgress?:(percent:number)=>void};
export function checkDownloadSignal(signal?:AbortSignal) {
 if(signal?.aborted)throw new DOMException('Export annulé.','AbortError');
}

/** The collection keeps its WebP; gallery downloads get a real GIF encoding. */
export async function prepareStickerDownload(blob:Blob,{animated,isSticker,format='gallery',signal,onProgress}:Options):Promise<{blob:Blob;extension:'gif'|'webp'}>{
 checkDownloadSignal(signal);
 let output=blob;
 if(!(isSticker&&blob.type==='image/webp')&&!(animated&&format==='gallery'&&blob.type==='image/gif')){
  const {convert,defaults}=await import('./convert');
  checkDownloadSignal(signal);
  const converted=await convert(blob,{...defaults,animated,duration:6},percent=>{checkDownloadSignal(signal);onProgress?.(animated&&format==='gallery'?Math.round(percent*.4):percent);},signal);
  output=converted.blob;animated=converted.animated;
 }
 checkDownloadSignal(signal);
 if(animated&&format==='gallery'){
  const {exportAnimatedGif}=await import('./gif-export');
  const gif=await exportAnimatedGif(output,{signal,onProgress:percent=>onProgress?.(Math.round(40+percent*.6))});
  checkDownloadSignal(signal);
  return {blob:gif,extension:'gif'};
 }
 return {blob:output,extension:'webp'};
}
