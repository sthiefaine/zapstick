'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {registerAudioWork,renderAudio,type AudioRecipe,type AudioTrack} from '@/lib/stickers/audio';

/** One explicit listen to the source excerpt, independently of its placement. */
export function useAudioAudition(track:AudioTrack|null,recipe:AudioRecipe,length:number,playing:boolean,onPause:()=>void,onError:(message:string)=>void){
 const context=useRef<AudioContext|null>(null),node=useRef<AudioBufferSourceNode|null>(null),generation=useRef(0);
 const [listening,setListening]=useState(false);
 const stop=useCallback(()=>{
  generation.current++;
  const source=node.current;node.current=null;
  if(source){source.onended=null;try{source.stop();}catch{/* Already ended. */}source.disconnect();}
  const audio=context.current;context.current=null;
  if(audio&&audio.state!=='closed')void audio.close().catch(()=>{});
  setListening(false);
 },[]);
 useEffect(()=>stop,[track,recipe.start,recipe.duration,length,stop]);
 useEffect(()=>{if(playing)stop();},[playing,stop]);
 useEffect(()=>{
  const unregister=registerAudioWork(stop),hide=()=>{if(document.hidden)stop();};
  document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',stop);
  return()=>{unregister();document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',stop);stop();};
 },[stop]);
 async function toggle(){
  if(listening){stop();return;}
  if(!track)return;
  stop();onPause();const revision=generation.current;
  try{
   const audio=new AudioContext();context.current=audio;
   await audio.resume();if(revision!==generation.current)return;
   const duration=Math.min(length,recipe.duration??length,Math.max(0,track.buffer.duration-recipe.start));
   if(duration<=0){stop();return;}
   const source=audio.createBufferSource();source.buffer=renderAudio(track,{...recipe,offset:0,volume:1,duration},duration);
   source.connect(audio.destination);source.onended=()=>{if(node.current===source)stop();};
   node.current=source;setListening(true);source.start();
  }catch{if(revision===generation.current){stop();onError('Audio indisponible sur ce navigateur.');}}
 }
 return{listening,toggle,stop};
}
