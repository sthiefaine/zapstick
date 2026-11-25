'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Sticker} from '@/lib/stickers/types';
import {decodeAudio,defaultAudioRecipe,type AudioTrack,type AudioRecipe} from '@/lib/stickers/audio';
import {createMicrophoneSession,type MicrophoneState} from '@/lib/stickers/microphone';

/** Audio owns its source: replacing the visual with a cutout never replaces it. */
export function useSoundEditor(draft:Sticker|null,active:boolean,onPause:()=>void,onError:(message:string)=>void){
 const [track,setTrack]=useState<AudioTrack|null>(null),[recipe,setRecipe]=useState<AudioRecipe>({...defaultAudioRecipe});
 const [pending,setPending]=useState(false),[microphone,setMicrophone]=useState<MicrophoneState>('idle'),[elapsed,setElapsed]=useState(0),[hasOriginal,setHasOriginal]=useState(false);
 const original=useRef<Blob|null>(null),operation=useRef<AbortController|null>(null),mic=useRef<ReturnType<typeof createMicrophoneSession>|null>(null);
 const callbacks=useRef({onPause,onError});
 useEffect(()=>{callbacks.current={onPause,onError};},[onPause,onError]);
 const cancel=useCallback(()=>{operation.current?.abort();operation.current=null;mic.current?.cancel();mic.current=null;setPending(false);setMicrophone('idle');},[]);
 const load=useCallback(async(blob:Blob,name:string,source:AudioTrack['source'])=>{
  cancel();const controller=new AbortController();operation.current=controller;
  callbacks.current.onPause();setPending(true);
  try{const next=await decodeAudio(blob,{name:name.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,120),source,signal:controller.signal});if(!controller.signal.aborted){setTrack(next);setRecipe({...defaultAudioRecipe});}}
  catch(error){if(!controller.signal.aborted)callbacks.current.onError(error instanceof Error?error.message:'Audio indisponible sur ce navigateur.');}
  finally{if(operation.current===controller){operation.current=null;setPending(false);}}
 },[cancel]);
 useEffect(()=>{
  // The external draft identity starts a new capture/decoding session. A cutout
  // replaces only its visual Blob and must keep this original audio session.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  cancel();setTrack(null);setRecipe({...defaultAudioRecipe});setElapsed(0);
  original.current=draft?.sound?.blob??(draft?.mime.startsWith('video/')?draft.blob??null:null);
  setHasOriginal(!!original.current);
  if(draft?.sound)void load(draft.sound.blob,draft.sound.name,'original');
  return cancel;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[draft?.id,cancel,load]);
 useEffect(()=>{
  // Hidden editors stay mounted; ending their capture must also update the UI.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if(!active)cancel();
 },[active,cancel]);
 useEffect(()=>{const hide=()=>{if(document.hidden){cancel();callbacks.current.onPause();}};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',cancel);return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',cancel);};},[cancel]);
 async function record(){
  if(mic.current||operation.current)return;
  cancel();callbacks.current.onPause();setElapsed(0);
  const controller=new AbortController();operation.current=controller;
  const session=createMicrophoneSession({onState:setMicrophone,onElapsed:setElapsed});mic.current=session;
  try{
   const blob=await session.record(controller.signal);
   if(controller.signal.aborted)return;
   setPending(true);
   const next=await decodeAudio(blob,{name:'Micro',source:'microphone',signal:controller.signal});
   if(!controller.signal.aborted){setTrack(next);setRecipe({...defaultAudioRecipe});}
  }catch(error){if(!controller.signal.aborted&&!(error instanceof DOMException&&error.name==='AbortError'))callbacks.current.onError(error instanceof Error?error.message:'Audio indisponible sur ce navigateur.');}
  finally{if(operation.current===controller){operation.current=null;mic.current=null;setPending(false);setMicrophone('idle');}}
 }
 return {track,recipe,setRecipe,pending,microphone,elapsed,cancel,record,stop:()=>mic.current?.stop(),
  hasOriginal,chooseOriginal:()=>{if(original.current)void load(original.current,draft?.name??'Original','original');},
  chooseFile:(file:File)=>load(file,file.name.replace(/\.[^.]+$/,'')||'Audio','file'),
  remove:()=>{cancel();setTrack(null);setRecipe({...defaultAudioRecipe});},
 };
}
