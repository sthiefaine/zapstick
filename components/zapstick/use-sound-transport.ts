'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {renderAudioMix,registerAudioWork,type AudioLayer} from '@/lib/stickers/audio';

/** Web Audio is the common clock; visual frames read it instead of starting another timer. */
export function useSoundTransport({layers,length,start,playing,active,seek,onError}:{layers:readonly AudioLayer[];length:number;start:number;playing:boolean;active:boolean;seek:{time:number;revision:number};onError:(message:string)=>void}){
 const context=useRef<AudioContext|null>(null),node=useRef<AudioBufferSourceNode|null>(null);
 const scheduled=useRef<{at:number;offset:number;length:number;start:number}|null>(null),resume=useRef(0),revision=useRef(-1);
 const [unlocked,setUnlocked]=useState(0),errorRef=useRef(onError);
 useEffect(()=>{errorRef.current=onError;},[onError]);
 const clock=useCallback(()=>{
  const s=scheduled.current,c=context.current;if(!s||!c)return null;
  // Render time precedes what the listener hears, particularly over Bluetooth.
  const timestamp=c.getOutputTimestamp?.();
  const heard=typeof timestamp?.performanceTime==='number'&&timestamp.performanceTime>0&&typeof timestamp.contextTime==='number'?Math.min(c.currentTime,timestamp.contextTime+Math.max(0,(performance.now()-timestamp.performanceTime)/1000)):Math.max(0,c.currentTime-(c.outputLatency||0));
  return s.start+((s.offset+Math.max(0,heard-s.at))%s.length);
 },[]);
 const stop=useCallback(()=>{const time=clock();if(time!==null)resume.current=time;scheduled.current=null;try{node.current?.stop();}catch{/* Already stopped. */}node.current?.disconnect();node.current=null;},[clock]);
 const unlock=useCallback(async()=>{
  try{context.current??=new AudioContext();await context.current.resume();setUnlocked(value=>value+1);return true;}
  catch{errorRef.current('Audio indisponible sur ce navigateur.');return false;}
 },[]);
 useEffect(()=>{
  stop();
  if(!layers.length||!active||!playing||!length||!context.current||context.current.state!=='running')return;
  try{
   const buffer=renderAudioMix(layers,length),source=context.current.createBufferSource();
   source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;source.connect(context.current.destination);
   const position=revision.current!==seek.revision?seek.time:resume.current;
   revision.current=seek.revision;
   const offset=Math.max(0,Math.min(buffer.duration-.0001,position-start));
   scheduled.current={at:context.current.currentTime,offset,length:buffer.duration,start};node.current=source;source.start(0,offset);
  }catch(error){errorRef.current(error instanceof Error?error.message:'Audio indisponible sur ce navigateur.');}
  return stop;
 },[layers,length,start,playing,active,seek.revision,seek.time,unlocked,stop]);
 useEffect(()=>{
  const unregister=registerAudioWork(()=>{stop();void context.current?.close();context.current=null;});
  const hide=()=>{if(document.hidden)stop();};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',stop);
  return()=>{unregister();stop();void context.current?.close();context.current=null;document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',stop);};
 },[stop]);
 return {clock,unlock,stop};
}
