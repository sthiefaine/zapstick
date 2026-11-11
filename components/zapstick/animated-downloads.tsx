'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,LoaderCircle} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {download} from '@/lib/stickers/store';
import './animated-downloads.css';

type Props={blob:Blob;name:string;onBusyChange:(busy:boolean)=>void;onError:(message:string)=>void};
export function AnimatedDownloads({blob,name,onBusyChange,onError}:Props){
 const {t}=usePreferences(),[percent,setPercent]=useState<number|null>(null);
 const operation=useRef<AbortController|null>(null),cached=useRef<Blob|null>(null),callbacks=useRef({onBusyChange,onError});
 callbacks.current={onBusyChange,onError};
 useEffect(()=>()=>{operation.current?.abort();operation.current=null;cached.current=null;callbacks.current.onBusyChange(false);},[blob]);
 const safeName=name.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,70)||'sticker';
 async function saveGif(){
  if(operation.current)return;
  if(cached.current){download(cached.current,`${safeName}.gif`);return;}
  const controller=new AbortController();operation.current=controller;setPercent(0);callbacks.current.onBusyChange(true);
  try{
   const {exportAnimatedGif}=await import('@/lib/stickers/gif-export');
   const result=await exportAnimatedGif(blob,{signal:controller.signal,onProgress:value=>{if(!controller.signal.aborted)setPercent(Math.round(value));}});
   if(controller.signal.aborted)return;
   cached.current=result;download(result,`${safeName}.gif`);
  }catch(error){if(!controller.signal.aborted)callbacks.current.onError(error instanceof Error?error.message:'Une erreur est survenue.');}
  finally{if(operation.current===controller){operation.current=null;setPercent(null);callbacks.current.onBusyChange(false);}}
 }
 return <div className="animated-downloads" aria-busy={percent!==null}>
  <button type="button" className="button primary full-width" onClick={saveGif} disabled={percent!==null}>{percent!==null?<LoaderCircle className="spin" size={18} aria-hidden="true"/>:<Download size={18} aria-hidden="true"/>}{percent!==null?t('Préparation du GIF… {percent} %',{percent}):t('Télécharger le GIF animé')}</button>
  {percent!==null?<><p className="sr-only" role="status">{t('Préparation du GIF… {percent} %',{percent})}</p><button type="button" className="quiet-button" onClick={()=>operation.current?.abort()}>{t('Annuler')}</button></>:<button type="button" className="quiet-button" onClick={()=>download(blob,`${safeName}.webp`)}>{t('Télécharger le WebP')}</button>}
 </div>;
}
