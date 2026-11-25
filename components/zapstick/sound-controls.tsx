'use client';
import {useMemo,useRef,type PointerEvent} from 'react';
import {Mic,Square,Upload,Volume2,VolumeX,RotateCcw,Trash2,LoaderCircle,Video,Plus} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {planAudioWindow,type AudioTrack,type AudioRecipe} from '@/lib/stickers/audio';
import type {SoundSlot,useSoundEditor} from './use-sound-editor';
import './sound-controls.css';

type Props={editor:ReturnType<typeof useSoundEditor>;recipes:readonly AudioRecipe[];length:number;currentTime:number;disabled:boolean};
type WaveProps={track:AudioTrack;recipe:AudioRecipe;index:SoundSlot;length:number;currentTime:number;disabled:boolean;onSelect:()=>void;onChange:(recipe:AudioRecipe)=>void};
function SoundWave({track,recipe,index,length,currentTime,disabled,onSelect,onChange}:WaveProps){
 const {t,locale}=usePreferences(),wave=useRef<HTMLDivElement>(null),drag=useRef<{x:number;offset:number}|null>(null);
 const peaks=useMemo(()=>{
  const buffer=track.buffer,plan=planAudioWindow(buffer.length,buffer.sampleRate,{start:recipe.start,offset:recipe.offset,volume:recipe.volume},length),step=Math.max(1,Math.floor(plan.length/48));
  const channels=Array.from({length:buffer.numberOfChannels},(_,channel)=>buffer.getChannelData(channel));
  return Array.from({length:48},(_,i)=>{let max=0;for(let j=0;j<step;j+=Math.max(1,Math.floor(step/32))){const at=i*step+j-plan.targetStart;if(at>=0&&at<plan.count)for(const data of channels)max=Math.max(max,Math.abs(data[plan.sourceStart+at]??0)*plan.volume);}return max;});
 },[track,recipe.start,recipe.offset,recipe.volume,length]);
 const peakMax=Math.max(.01,...peaks),minOffset=-length;
 const seconds=(value:number)=>new Intl.NumberFormat(locale,{minimumFractionDigits:1,maximumFractionDigits:2}).format(value);
 const change=(value:number)=>onChange({...recipe,offset:Math.round(Math.max(-length,Math.min(length,value))*100)/100});
 function move(e:PointerEvent<HTMLDivElement>){if(!drag.current||!wave.current)return;change(drag.current.offset+(e.clientX-drag.current.x)/wave.current.clientWidth*length);}
 return <div ref={wave} className="sound-wave" role="slider" tabIndex={disabled?-1:0} aria-label={t('Décalage de la piste {number}',{number:index+1})} aria-valuemin={minOffset} aria-valuemax={length} aria-valuenow={recipe.offset} aria-valuetext={`${recipe.offset>0?'+':''}${seconds(recipe.offset)} s`} aria-disabled={disabled} onPointerDown={e=>{if(disabled)return;onSelect();drag.current={x:e.clientX,offset:recipe.offset};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onFocus={onSelect} onKeyDown={e=>{if(disabled)return;const step=e.shiftKey?.5:.05;const values:Record<string,number>={ArrowLeft:recipe.offset-step,ArrowDown:recipe.offset-step,ArrowRight:recipe.offset+step,ArrowUp:recipe.offset+step,Home:-length,End:length};if(e.key in values){e.preventDefault();change(values[e.key]);}}}>
  <div className="sound-wave-bars" aria-hidden="true">{peaks.map((v,i)=><i key={i} style={{height:`${Math.max(5,v/peakMax*82)}%`}}/>)}</div><span className="sound-wave-playhead" aria-hidden="true" style={{left:`${length?Math.max(0,Math.min(100,currentTime/length*100)):0}%`}}/>
 </div>;
}

export function SoundControls({editor:e,recipes,length,currentTime,disabled}:Props){
 const {t,locale}=usePreferences(),file=useRef<HTMLInputElement>(null),fileTarget=useRef<SoundSlot>(0);
 const selected=e.selected,track=e.tracks[selected],recipe=recipes[selected]??e.recipes[selected],capture=e.microphone!=='idle',busy=e.pending||capture,number=selected+1;
 const seconds=(value:number)=>new Intl.NumberFormat(locale,{minimumFractionDigits:1,maximumFractionDigits:2}).format(value);
 const change=(key:keyof AudioRecipe,value:number)=>e.setRecipe({...e.recipes[selected],[key]:value},selected);
 const chooseFile=(index:SoundSlot)=>{e.select(index);fileTarget.current=index;file.current?.click();};
 return <div className="sound-controls">
  <div className="sound-tracks" role="group" aria-label={t('Pistes audio')}>
   {([0,1] as const).map(index=>{
    const item=e.tracks[index],plan=recipes[index]??e.recipes[index],active=e.selected===index;
    return <div key={index} className={`sound-row${active?' is-selected':''}`}>
     <button className="sound-row-label" type="button" aria-pressed={active} aria-label={t('Sélectionner la piste {number}',{number:index+1})} disabled={disabled} onClick={()=>e.select(index)}><strong>{t('Piste {number}',{number:index+1})}</strong><span>{item?.name??t('Aucun son')}</span></button>
     {item?<><SoundWave track={item} recipe={plan} index={index} length={length} currentTime={currentTime} disabled={disabled||busy} onSelect={()=>e.select(index)} onChange={value=>e.setRecipe({...e.recipes[index],offset:value.offset},index)}/><button className="sound-row-mute" type="button" aria-label={plan.volume?t('Couper la piste {number}',{number:index+1}):t('Réactiver la piste {number}',{number:index+1})} disabled={disabled||busy} onClick={()=>e.setRecipe({...e.recipes[index],volume:plan.volume?0:1},index)}>{plan.volume?<Volume2 size={18}/>:<VolumeX size={18}/>}</button></>:<button className="sound-add" type="button" disabled={disabled||busy} aria-label={t('Ajouter un son à la piste {number}',{number:index+1})} onClick={()=>chooseFile(index)}><Plus size={18}/>{t('Ajouter un son')}</button>}
    </div>;
   })}
  </div>
  <div className="sound-sources" role="group" aria-label={t('Source de la piste {number}',{number})}>
   <button type="button" aria-pressed={track?.source==='original'} disabled={disabled||busy||!e.hasOriginal} onClick={e.chooseOriginal}><Video size={17}/>{t('Original')}</button>
   <button type="button" aria-pressed={track?.source==='file'} disabled={disabled||busy} onClick={()=>chooseFile(selected)}><Upload size={17}/>{t('Importer un son')}</button>
   <button type="button" aria-pressed={track?.source==='microphone'} disabled={disabled||busy} onClick={e.record}><Mic size={17}/>{t('Micro')}</button>
  </div>
  <input hidden ref={file} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.webm" onChange={event=>{const next=event.target.files?.[0];event.target.value='';if(next)void e.chooseFile(next,fileTarget.current);}}/>
  {e.pending?<div className="sound-status" role="status"><LoaderCircle size={17} className="spin"/><span>{t('Piste {number}',{number:(e.busySlot??selected)+1})} · {t('Chargement du son…')}</span><button className="quiet-button" onClick={e.cancel}>{t('Annuler')}</button></div>:null}
  {capture?<div className="sound-recording"><span role="status">{t('Piste {number}',{number:(e.busySlot??selected)+1})} · {e.microphone==='waiting'?t('En attente du microphone…'):<>{t('Enregistrement…')} <strong>{seconds(e.elapsed)} / 6 s</strong></>}</span><button className="button secondary" onClick={e.microphone==='recording'?e.stop:e.cancel}>{e.microphone==='recording'?<><Square size={15}/>{t('Arrêter')}</>:t('Annuler')}</button>{e.microphone==='recording'?<button className="quiet-button" onClick={e.cancel}>{t('Annuler')}</button>:null}</div>:null}
  {track?<div className="sound-selected-controls" role="group" aria-label={t('Réglages de la piste {number}',{number})}>
   <div className="sound-offset"><span>{t('Décalage')} <strong>{recipe.offset>0?'+':''}{seconds(recipe.offset)} s</strong></span><div><button type="button" className="sound-action" title={t('Réinitialiser le son')} aria-label={t('Réinitialiser la piste {number}',{number})} disabled={disabled||busy} onClick={()=>e.setRecipe({...e.recipes[selected],offset:0,volume:1,...(track.source!=='original'?{start:0}:{})},selected)}><RotateCcw size={17}/></button><button type="button" className="sound-action" title={t('Retirer le son')} aria-label={t('Retirer le son de la piste {number}',{number})} disabled={disabled||busy} onClick={()=>e.remove(selected)}><Trash2 size={17}/></button></div></div>
   {track.source!=='original'&&track.buffer.duration>length+.05?<label className="sound-range"><span>{t('Début de l’extrait')}<output>{seconds(recipe.start)} s</output></span><input aria-label={t('Début de l’extrait de la piste {number}',{number})} type="range" min="0" max={Math.max(0,track.buffer.duration-.05)} step=".05" value={recipe.start} disabled={disabled||busy} onChange={event=>change('start',Number(event.target.value))}/></label>:null}
   <div className="sound-range sound-volume"><Volume2 size={17} aria-hidden="true"/><label className="sr-only" htmlFor={`sound-volume-${selected}`}>{t('Volume de la piste {number}',{number})}</label><input id={`sound-volume-${selected}`} aria-label={t('Volume de la piste {number}',{number})} type="range" min="0" max="1" step=".01" value={recipe.volume} disabled={disabled||busy} onChange={event=>change('volume',Number(event.target.value))}/><output>{Math.round(recipe.volume*100)} %</output></div>
   {track.source==='microphone'?<button className="quiet-button sound-record-again" disabled={disabled||busy} onClick={e.record}><Mic size={15}/>{t('Refaire')}</button>:null}
  </div>:!busy?<p className="sound-empty">{t('Choisis un audio de moins de 5 Mo et de 30 secondes maximum.')}</p>:null}
 </div>;
}
