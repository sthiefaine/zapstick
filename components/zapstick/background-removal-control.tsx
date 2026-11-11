'use client';

import {useEffect,useRef,useState} from 'react';
import {Eraser,LoaderCircle,X} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {backgroundTranslations} from '@/lib/i18n/background-translations';
import {BackgroundRemovalError,removeImageBackground,type BackgroundProgress} from '@/lib/stickers/background-removal';

type Props={blob:Blob;disabled?:boolean;onResult:(blob:Blob)=>void|Promise<void>;onBusyChange?:(busy:boolean)=>void};
const errorLabels:Record<string,string>={unsupported:'Le détourage n’est pas disponible dans ce navigateur.', 'invalid-image':'Utilise une image JPG, PNG ou WebP statique.',animated:'Le détourage est réservé aux images fixes.','too-large':'Image trop grande : utilise une photo de 16 mégapixels et 20 Mo maximum.',download:'Le modèle n’a pas pu être téléchargé. Réessaie avec une connexion Internet.',model:'Le détourage a échoué. Ton image d’origine est conservée.',timeout:'Le détourage a pris trop de temps. Réessaie avec une image plus petite.',busy:'Un détourage est déjà en cours.',cancelled:'Détourage annulé.'};

export function BackgroundRemovalControl({blob,disabled=false,onResult,onBusyChange}:Props){
 const {locale}=usePreferences(),[busy,setBusy]=useState(false),[progress,setProgress]=useState<BackgroundProgress>({stage:'preparing'}),[notice,setNotice]=useState('');
 const operation=useRef<AbortController|null>(null),generation=useRef(0),busyCallback=useRef(onBusyChange);busyCallback.current=onBusyChange;
 const label=(source:string)=>backgroundTranslations[locale][source]??source;
 useEffect(()=>{generation.current++;operation.current?.abort();operation.current=null;setBusy(false);setNotice('');busyCallback.current?.(false);return()=>{generation.current++;operation.current?.abort();operation.current=null;busyCallback.current?.(false);};},[blob]);
 async function start(){
  if(disabled||operation.current)return;
  const id=++generation.current,controller=new AbortController();operation.current=controller;setBusy(true);setNotice('');setProgress({stage:'preparing'});busyCallback.current?.(true);
  try{const result=await removeImageBackground(blob,{signal:controller.signal,onProgress:value=>{if(generation.current===id)setProgress(value);}});if(generation.current!==id||controller.signal.aborted)return;await onResult(result);if(generation.current===id)setNotice('Fond retiré.');}
  catch(error){if(generation.current===id)setNotice(errorLabels[error instanceof BackgroundRemovalError?error.code:'model']);}
  finally{if(generation.current===id){operation.current=null;setBusy(false);busyCallback.current?.(false);}}
 }
 const status=progress.stage==='downloading'?`${label('Téléchargement du modèle…')} ${progress.percent??0} %`:label(progress.stage==='processing'?'Détourage sur cet appareil…':'Préparation…');
 return <div className="background-removal-control" aria-busy={busy}>
  <div className="background-removal-actions">
   <button type="button" className="button secondary" onClick={start} disabled={disabled||busy}>{busy?<LoaderCircle size={18} className="spin" aria-hidden="true"/>:<Eraser size={18} aria-hidden="true"/>}{label('Retirer le fond')}</button>
   {busy?<button type="button" className="button light" onClick={()=>operation.current?.abort()}><X size={16} aria-hidden="true"/>{label('Annuler')}</button>:null}
  </div>
  <p className="background-removal-note">{label('Sur cet appareil · téléchargement initial ≈ 19 Mo')}</p>
  <p className="background-removal-note">{label('Le résultat peut varier. Ton original reste conservé.')}</p>
  <p className="background-removal-status" role="status" aria-live="polite" aria-atomic="true">{busy?status:notice?label(notice):''}</p>
 </div>;
}
