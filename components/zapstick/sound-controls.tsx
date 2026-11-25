'use client';
import {useMemo,useRef,type PointerEvent} from 'react';
import {AudioLines,Mic,Square,Upload,Volume2,VolumeX,RotateCcw,Trash2,LoaderCircle,Video} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import type {AudioTrack,AudioRecipe} from '@/lib/stickers/audio';
import {planAudioWindow} from '@/lib/stickers/audio';
import type {MicrophoneState} from '@/lib/stickers/microphone';
import './sound-controls.css';

type Props={track:AudioTrack|null;recipe:AudioRecipe;length:number;currentTime:number;disabled:boolean;pending:boolean;microphone:MicrophoneState;elapsed:number;hasOriginal:boolean;onOriginal:()=>void;onFile:(file:File)=>void;onRecord:()=>void;onStop:()=>void;onCancel:()=>void;onRemove:()=>void;onChange:(recipe:AudioRecipe)=>void};
export function SoundControls(p:Props){
 const {t,locale}=usePreferences(),file=useRef<HTMLInputElement>(null),wave=useRef<HTMLDivElement>(null),drag=useRef<{x:number;offset:number}|null>(null);
 const seconds=(value:number)=>new Intl.NumberFormat(locale,{minimumFractionDigits:1,maximumFractionDigits:2}).format(value);
 const peaks=useMemo(()=>{
  if(!p.track)return [];
  const buffer=p.track.buffer,plan=planAudioWindow(buffer.length,buffer.sampleRate,{start:p.recipe.start,offset:p.recipe.offset,volume:p.recipe.volume},p.length),step=Math.max(1,Math.floor(plan.length/64));
  return Array.from({length:64},(_,i)=>{let max=0;for(let j=0;j<step;j+=Math.max(1,Math.floor(step/40))){const at=i*step+j-plan.targetStart;if(at>=0&&at<plan.count)for(let channel=0;channel<buffer.numberOfChannels;channel++)max=Math.max(max,Math.abs(buffer.getChannelData(channel)[plan.sourceStart+at]??0)*plan.volume);}return max;});
 },[p.track,p.recipe.start,p.recipe.offset,p.recipe.volume,p.length]);
 const peakMax=Math.max(.01,...peaks);
 const change=(key:keyof AudioRecipe,value:number)=>p.onChange({...p.recipe,[key]:value});
 function move(e:PointerEvent<HTMLDivElement>){if(!drag.current||!wave.current)return;change('offset',Math.max(-p.length,Math.min(p.length,Math.round((drag.current.offset+(e.clientX-drag.current.x)/wave.current.clientWidth*p.length)*100)/100)));}
 const capture=p.microphone!=='idle';
 return <div className="sound-controls">
  <div className="sound-sources" role="group" aria-label={t('Son')}>
   <button type="button" aria-pressed={p.track?.source==='original'} disabled={p.disabled||p.pending||capture||!p.hasOriginal} onClick={p.onOriginal}><Video size={17}/>{t('Original')}</button>
   <button type="button" aria-pressed={p.track?.source==='file'} disabled={p.disabled||p.pending||capture} onClick={()=>file.current?.click()}><Upload size={17}/>{t('Importer un son')}</button>
   <button type="button" aria-pressed={p.track?.source==='microphone'} disabled={p.disabled||p.pending||capture} onClick={p.onRecord}><Mic size={17}/>{t('Micro')}</button>
  </div>
  <input hidden ref={file} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.webm" onChange={e=>{const next=e.target.files?.[0];e.target.value='';if(next)p.onFile(next);}}/>
  {p.pending?<div className="sound-status" role="status"><LoaderCircle size={17} className="spin"/>{t('Chargement du son…')}<button className="quiet-button" onClick={p.onCancel}>{t('Annuler')}</button></div>:null}
  {capture?<div className="sound-recording"><span role="status">{p.microphone==='waiting'?t('En attente du microphone…'):<>{t('Enregistrement…')} <strong>{seconds(p.elapsed)} / 6 s</strong></>}</span><button className="button secondary" onClick={p.microphone==='recording'?p.onStop:p.onCancel}>{p.microphone==='recording'?<><Square size={15}/>{t('Arrêter')}</>:t('Annuler')}</button>{p.microphone==='recording'?<button className="quiet-button" onClick={p.onCancel}>{t('Annuler')}</button>:null}</div>:null}
  {p.track?<>
   <div className="sound-track-label"><AudioLines size={17}/><span>{p.track.name}</span><button className="small-icon" aria-label={t('Retirer le son')} disabled={p.disabled||capture} onClick={p.onRemove}><Trash2 size={17}/></button></div>
   <div ref={wave} className="sound-wave" role="slider" tabIndex={p.disabled||capture?-1:0} aria-label={t('Décalage du son')} aria-valuemin={-p.length} aria-valuemax={p.length} aria-valuenow={p.recipe.offset} aria-valuetext={`${p.recipe.offset>0?'+':''}${seconds(p.recipe.offset)} s`} aria-disabled={p.disabled||capture} onPointerDown={e=>{if(p.disabled||capture)return;drag.current={x:e.clientX,offset:p.recipe.offset};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onKeyDown={e=>{if(p.disabled||capture)return;const step=e.shiftKey?.5:.05;const values:Record<string,number>={ArrowLeft:p.recipe.offset-step,ArrowDown:p.recipe.offset-step,ArrowRight:p.recipe.offset+step,ArrowUp:p.recipe.offset+step,Home:-p.length,End:p.length};if(e.key in values){e.preventDefault();change('offset',Math.round(Math.max(-p.length,Math.min(p.length,values[e.key]))*100)/100);}}}>
    <div className="sound-wave-bars" aria-hidden="true">{peaks.map((v,i)=><i key={i} style={{height:`${Math.max(5,v/peakMax*85)}%`}}/>)}</div><span className="sound-wave-playhead" aria-hidden="true" style={{left:`${p.length?Math.max(0,Math.min(100,p.currentTime/p.length*100)):0}%`}}/>
   </div>
   <div className="sound-offset"><span>{t('Décalage')} <strong>{p.recipe.offset>0?'+':''}{seconds(p.recipe.offset)} s</strong></span><button type="button" className="quiet-button" disabled={p.disabled||capture} onClick={()=>p.onChange({...p.recipe,offset:0,volume:1,...(p.track?.source!=='original'?{start:0}:{})})}><RotateCcw size={14}/>{t('Réinitialiser le son')}</button></div>
   {p.track.source!=='original'&&p.track.buffer.duration>p.length+.05?<label className="sound-range"><span>{t('Début de l’extrait')}<output>{seconds(p.recipe.start)} s</output></span><input aria-label={t('Début de l’extrait')} type="range" min="0" max={Math.max(0,p.track.buffer.duration-.05)} step=".05" value={p.recipe.start} disabled={p.disabled||capture} onChange={e=>change('start',Number(e.target.value))}/></label>:null}
   <div className="sound-range sound-volume"><button type="button" className="small-icon" aria-label={p.recipe.volume?t('Couper le son'):t('Réactiver le son')} disabled={p.disabled||capture} onClick={e=>{e.preventDefault();change('volume',p.recipe.volume?0:1);}}>{p.recipe.volume?<Volume2 size={19}/>:<VolumeX size={19}/>}</button><span className="sr-only">{t('Volume')}</span><input aria-label={t('Volume')} type="range" min="0" max="1" step=".01" value={p.recipe.volume} disabled={p.disabled||capture} onChange={e=>change('volume',Number(e.target.value))}/><output>{Math.round(p.recipe.volume*100)} %</output></div>
   {p.track.source==='microphone'?<button className="quiet-button" disabled={p.disabled||capture||p.pending} onClick={p.onRecord}><Mic size={15}/>{t('Refaire')}</button>:null}
  </>:!capture&&!p.pending?<p className="sound-empty">{t('Choisis un audio de moins de 5 Mo et de 30 secondes maximum.')}</p>:null}
 </div>;
}
