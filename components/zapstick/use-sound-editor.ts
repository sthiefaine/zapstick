'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {Sticker} from '@/lib/stickers/types';
import {decodeAudio,defaultAudioRecipe,type AudioTrack,type AudioRecipe} from '@/lib/stickers/audio';
import {createMicrophoneSession,type MicrophoneState} from '@/lib/stickers/microphone';

export type SoundSlot=0|1;
type Pair<T>=[T,T];
const emptyRecipes=():Pair<AudioRecipe>=>[{...defaultAudioRecipe},{...defaultAudioRecipe}];
function replaceSlot<T>(values:readonly[T,T],index:SoundSlot,value:T):Pair<T>{return index===0?[value,values[1]]:[values[0],value];}
const audioMessage=(error:unknown)=>error instanceof Error?error.message:'Audio indisponible sur ce navigateur.';

/** Each slot owns its source and recipe; visual cutouts never replace the audio. */
export function useSoundEditor(draft:Sticker|null,active:boolean,onPause:()=>void,onError:(message:string)=>void){
 const [tracks,setTracks]=useState<Pair<AudioTrack|null>>([null,null]),[recipes,setRecipes]=useState<Pair<AudioRecipe>>(emptyRecipes),[selected,setSelected]=useState<SoundSlot>(0);
 const [pending,setPending]=useState(false),[microphone,setMicrophone]=useState<MicrophoneState>('idle'),[elapsed,setElapsed]=useState(0),[originalAvailable,setOriginalAvailable]=useState<Pair<boolean>>([false,false]),[busySlot,setBusySlot]=useState<SoundSlot|null>(null);
 const original=useRef<Pair<Blob|null>>([null,null]),operation=useRef<{controller:AbortController;index:SoundSlot}|null>(null),mic=useRef<ReturnType<typeof createMicrophoneSession>|null>(null);
 const callbacks=useRef({onPause,onError});
 useEffect(()=>{callbacks.current={onPause,onError};},[onPause,onError]);
 const cancel=useCallback(()=>{operation.current?.controller.abort();operation.current=null;mic.current?.cancel();mic.current=null;setPending(false);setMicrophone('idle');setBusySlot(null);},[]);
 const load=useCallback(async(blob:Blob,name:string,source:AudioTrack['source'],index:SoundSlot)=>{
  if(operation.current)return;
  const controller=new AbortController();operation.current={controller,index};
  callbacks.current.onPause();setPending(true);setBusySlot(index);
  try{
   const next=await decodeAudio(blob,{name:name.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,120),source,signal:controller.signal});
   if(!controller.signal.aborted){setTracks(values=>replaceSlot(values,index,next));setRecipes(values=>replaceSlot(values,index,{...defaultAudioRecipe}));}
  }catch(error){if(!controller.signal.aborted)callbacks.current.onError(audioMessage(error));}
  finally{if(operation.current?.controller===controller){operation.current=null;setPending(false);setBusySlot(null);}}
 },[]);
 useEffect(()=>{
  // Only a new draft identity replaces these sessions. A cutout swaps its visual
  // Blob under the same identity and must keep both audio sources and recipes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  cancel();setTracks([null,null]);setRecipes(emptyRecipes());setSelected(0);setElapsed(0);
  const saved=draft?.soundLayers;
  const layers=saved?.length?saved.slice(0,2):draft?.sound?[draft.sound]:[];
  const video=draft?.mime.startsWith('video/')?draft.blob??null:null;
  original.current=[layers[0]?.blob??video,layers[1]?.blob??video];
  setOriginalAvailable([!!original.current[0],!!original.current[1]]);
  if(layers.length){
   const controller=new AbortController();operation.current={controller,index:0};setPending(true);setBusySlot(0);callbacks.current.onPause();
   void(async()=>{
    const restored:Pair<AudioTrack|null>=[null,null];
    try{
     for(let index=0;index<layers.length;index++){
      try{
       const track=await decodeAudio(layers[index].blob,{name:layers[index].name,source:'original',signal:controller.signal});
       restored[index as SoundSlot]=layers[index].offset!==undefined?{...track,compositionBound:true}:track;
      }
      catch(error){if(!controller.signal.aborted)callbacks.current.onError(audioMessage(error));}
      if(controller.signal.aborted)return;
     }
     setTracks(restored);
     setRecipes(emptyRecipes().map((recipe,index)=>{
      const layer=layers[index];
      return {...recipe,volume:layer?.volume??1,...(layer?.offset!==undefined?{offset:layer.offset,duration:layer.duration}:{})};
     }) as Pair<AudioRecipe>);
    }finally{if(operation.current?.controller===controller){operation.current=null;setPending(false);setBusySlot(null);}}
   })();
  }else if(video&&active){
   // Choose the video's audio once on import, before a user can save a silent
   // conversion. GIF-like MP4s often have no audio track: that is a normal case.
   const controller=new AbortController();operation.current={controller,index:0};setPending(true);setBusySlot(0);
   void decodeAudio(video,{name:draft?.name??'Original',source:'original',signal:controller.signal}).then(track=>{
    if(controller.signal.aborted)return;
    callbacks.current.onPause();setTracks([track,null]);
   }).catch(error=>{
    if(controller.signal.aborted)return;
    if(error instanceof Error&&error.message==='Aucun son détecté dans ce média.')setOriginalAvailable([false,false]);
    else callbacks.current.onError(audioMessage(error));
   }).finally(()=>{if(operation.current?.controller===controller){operation.current=null;setPending(false);setBusySlot(null);}});
  }
  return cancel;
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[draft?.id,cancel]);
 useEffect(()=>{
  // Hidden editors stay mounted, so navigation must explicitly end capture.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if(!active)cancel();
 },[active,cancel]);
 useEffect(()=>{const hide=()=>{if(document.hidden){cancel();callbacks.current.onPause();}};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',cancel);return()=>{document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',cancel);};},[cancel]);
 async function record(){
  if(mic.current||operation.current)return;
  const index=selected,controller=new AbortController();operation.current={controller,index};callbacks.current.onPause();setElapsed(0);setBusySlot(index);
  const session=createMicrophoneSession({onState:value=>{if(operation.current?.controller===controller)setMicrophone(value);},onElapsed:value=>{if(operation.current?.controller===controller)setElapsed(value);}});mic.current=session;
  try{
   const blob=await session.record(controller.signal);
   if(controller.signal.aborted)return;
   setPending(true);
   const next=await decodeAudio(blob,{name:'Micro',source:'microphone',signal:controller.signal});
   if(!controller.signal.aborted){setTracks(values=>replaceSlot(values,index,next));setRecipes(values=>replaceSlot(values,index,{...defaultAudioRecipe}));}
  }catch(error){if(!controller.signal.aborted&&!(error instanceof DOMException&&error.name==='AbortError'))callbacks.current.onError(audioMessage(error));}
  finally{if(operation.current?.controller===controller){operation.current=null;mic.current=null;setPending(false);setMicrophone('idle');setBusySlot(null);}}
 }
 const setRecipe=(value:AudioRecipe,index:SoundSlot=selected)=>setRecipes(values=>replaceSlot(values,index,value));
 return {tracks,recipes,selected,select:setSelected,setRecipe,pending,microphone,elapsed,busySlot,cancel,record,stop:()=>mic.current?.stop(),
  // Aliases keep callers reading the active slot straightforward.
  track:tracks[selected],recipe:recipes[selected],hasOriginal:originalAvailable[selected],
  chooseOriginal:()=>{const index=selected,blob=original.current[index];if(blob)void load(blob,draft?.name??'Original','original',index);},
  chooseFile:(file:File,index:SoundSlot=selected)=>load(file,file.name.replace(/\.[^.]+$/,'')||'Audio','file',index),
  remove:(index:SoundSlot=selected)=>{if(operation.current?.index===index)cancel();setTracks(values=>replaceSlot(values,index,null));setRecipes(values=>replaceSlot(values,index,{...defaultAudioRecipe}));},
 };
}
