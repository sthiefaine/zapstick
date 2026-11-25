'use client';
import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import {Mic,Square,Upload,Volume2,VolumeX,Trash2,LoaderCircle,Video,Plus,Play,Pause,Headphones,Scissors} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {planAudioWindow,type AudioTrack,type AudioRecipe} from '@/lib/stickers/audio';
import {useAudioAudition} from './use-audio-audition';
import type {SoundSlot,useSoundEditor} from './use-sound-editor';
import './sound-controls.css';

type Props={editor:ReturnType<typeof useSoundEditor>;recipes:readonly AudioRecipe[];length:number;currentTime:number;playing:boolean;disabled:boolean;onTogglePlay:()=>void;onPause:()=>void;onError:(message:string)=>void};
type ClipProps={track:AudioTrack;recipe:AudioRecipe;index:SoundSlot;length:number;currentTime:number;selected:boolean;disabled:boolean;snap:number;onSelect:()=>void;onMove:(value:number)=>void};
function SoundTime({value,max,label,disabled,onChange}:{value:number;max:number;label:string;disabled:boolean;onChange:(value:number)=>void}){
 const [draft,setDraft]=useState(String(Math.round(value*100)/100)),focused=useRef(false);
 useEffect(()=>{if(!focused.current)setDraft(String(Math.round(value*100)/100));},[value]);
 return <input type="number" inputMode="decimal" aria-label={label} min={0} max={Math.round(max*100)/100} step="any" value={draft} disabled={disabled} onFocus={()=>{focused.current=true;}} onChange={event=>{const next=event.target.value;setDraft(next);if(next!==''&&Number.isFinite(Number(next)))onChange(Number(next));}} onBlur={()=>{focused.current=false;const next=draft===''||!Number.isFinite(Number(draft))?value:Math.max(0,Math.min(max,Number(draft)));setDraft(String(Math.round(next*100)/100));onChange(next);}}/>;
}
function SoundClip({track,recipe,index,length,currentTime,selected,disabled,snap,onSelect,onMove}:ClipProps){
 const {t}=usePreferences(),lane=useRef<HTMLDivElement>(null),drag=useRef<{x:number;offset:number}|null>(null);
 const plan=planAudioWindow(track.buffer.length,track.buffer.sampleRate,recipe,length);
 const peaks=useMemo(()=>{
  const data=track.buffer.getChannelData(0),step=Math.max(1,Math.floor(plan.count/32));
  return Array.from({length:32},(_,i)=>{let peak=0;for(let j=0;j<step;j+=Math.max(1,Math.floor(step/16)))peak=Math.max(peak,Math.abs(data[plan.sourceStart+i*step+j]??0));return peak;});
 },[track,plan.sourceStart,plan.count]);
 const max=Math.max(.01,...peaks);
 function move(value:number){const bounded=Math.max(-length,Math.min(length-.01,value));onMove(Math.round((Math.abs(bounded-snap)<.12?snap:bounded)*100)/100);}
 function pointerMove(event:PointerEvent<HTMLButtonElement>){if(drag.current&&lane.current)move(drag.current.offset+(event.clientX-drag.current.x)/lane.current.clientWidth*length);}
 return <div ref={lane} className="sound-lane">
  <button type="button" className={`sound-clip${selected?' is-selected':''}`} aria-label={t('Déplacer la piste {number}',{number:index+1})} aria-pressed={selected} disabled={disabled} style={{left:`${Math.min(97,plan.targetStart/plan.length*100)}%`,width:`${plan.count/plan.length*100}%`}} onPointerDown={event=>{if(disabled)return;event.preventDefault();onSelect();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,offset:recipe.offset};}} onPointerMove={pointerMove} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onClick={onSelect} onKeyDown={event=>{const values:Record<string,number>={ArrowLeft:recipe.offset-(event.shiftKey?.5:.05),ArrowRight:recipe.offset+(event.shiftKey?.5:.05),Home:0};if(Object.hasOwn(values,event.key)){event.preventDefault();move(values[event.key]);}}}>
   <span className="sound-clip-bars" aria-hidden="true">{peaks.map((peak,i)=><i key={i} style={{height:`${Math.max(12,peak/max*78)}%`}}/>)}</span><span className="sound-clip-name">{track.name}</span>
  </button>
  <span className="sound-lane-playhead" style={{left:`${Math.max(0,Math.min(100,currentTime/length*100))}%`}} aria-hidden="true"/>
 </div>;
}

export function SoundControls({editor:e,recipes,length,currentTime,playing,disabled,onTogglePlay,onPause,onError}:Props){
 const {t,locale}=usePreferences(),file=useRef<HTMLInputElement>(null),fileTarget=useRef<SoundSlot>(0);
 const selected=e.selected,track=e.tracks[selected],recipe=recipes[selected]??e.recipes[selected],capture=e.microphone!=='idle',busy=e.pending||capture,number=selected+1;
 const seconds=(value:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value);
 const first=recipes[0]??e.recipes[0],second=recipes[1]??e.recipes[1];
 const firstEnd=Math.max(0,first.offset+Math.min(first.duration??length,Math.max(0,(e.tracks[0]?.buffer.duration??0)-first.start)));
 const sequential=!!e.tracks[0]&&!!e.tracks[1]&&firstEnd>0&&Math.abs(second.offset-firstEnd)<.015;
 const sourceRemaining=track?Math.max(0,track.buffer.duration-Math.max(0,recipe.start)):0;
 const maxDuration=Math.max(0,Math.min(sourceRemaining,length-(selected===0&&sequential?Math.max(0,recipe.offset)+.05:0)));
 const clipDuration=Math.min(maxDuration,Math.max(0,recipe.duration??maxDuration));
 const audition=useAudioAudition(track,recipe,length,playing,onPause,onError);
 function write(index:SoundSlot,value:AudioRecipe){
  const effective=recipes[index]??e.recipes[index],base=e.recipes[index];
  e.setRecipe({...value,start:value.sourcePinned?value.start:value.start-(effective.start-base.start),offset:value.offset+(e.tracks[index]?.compositionBound?e.visualStart:0)},index);
 }
 function changeExcerpt(start:number,duration:number){
  if(!track)return;
  const bounded=Math.max(0,Math.min(track.buffer.duration-.01,start));
  const next={...recipe,start:bounded,duration:Math.max(.01,Math.min(duration,length,track.buffer.duration-bounded)),...(track.source==='original'&&!track.compositionBound?{sourcePinned:true}:{})};
  write(selected,next);
 }
 const chooseFile=(index:SoundSlot)=>{audition.stop();e.select(index);fileTarget.current=index;file.current?.click();};
 const sources=<div className="sound-sources" role="group" aria-label={t('Source de la piste {number}',{number})}>
  <button type="button" disabled={disabled||busy||!e.hasOriginal} onClick={()=>{audition.stop();e.chooseOriginal();}}><Video size={17}/>{t('Original')}</button>
  <button type="button" disabled={disabled||busy} onClick={()=>chooseFile(selected)}><Upload size={17}/>{t('Importer un son')}</button>
  <button type="button" disabled={disabled||busy} onClick={()=>{audition.stop();e.record();}}><Mic size={17}/>{t('Micro')}</button>
 </div>;
 return <div className="sound-controls">
  <div className="sound-montage-heading"><button type="button" className="sound-listen-mix" disabled={disabled||busy} onClick={()=>{audition.stop();onTogglePlay();}}>{playing?<Pause size={17}/>:<Play size={17}/>}<span>{playing?t('Mettre en pause'):t('Écouter le montage')}</span></button><span className="sound-total">{seconds(length)} s</span></div>
  <div className="sound-ruler" aria-hidden="true"><span>0 s</span><span>{seconds(length)} s</span></div>
  <div className="sound-tracks" role="group" aria-label={t('Pistes audio')}>
   {([0,1] as const).map(index=>{
    const item=e.tracks[index],plan=recipes[index]??e.recipes[index],active=selected===index;
    return <div key={index} className={`sound-row${active?' is-selected':''}`}>
     <button className="sound-row-label" type="button" aria-pressed={active} aria-label={t('Sélectionner la piste {number}',{number:index+1})} disabled={disabled||busy} onClick={()=>{audition.stop();e.select(index);}}>{t('Son {number}',{number:index+1})}</button>
     {item?<><SoundClip track={item} recipe={plan} index={index} length={length} currentTime={currentTime} selected={active} disabled={disabled||busy} snap={index===1?firstEnd:0} onSelect={()=>e.select(index)} onMove={offset=>write(index,{...plan,offset,...(index===1?{afterPrevious:false}:{}),duration:plan.duration??Math.min(length,item.buffer.duration-plan.start)})}/><button className="sound-row-mute" type="button" aria-label={plan.volume?t('Couper la piste {number}',{number:index+1}):t('Réactiver la piste {number}',{number:index+1})} disabled={disabled||busy} onClick={()=>write(index,{...plan,volume:plan.volume?0:1})}>{plan.volume?<Volume2 size={17}/>:<VolumeX size={17}/>}</button></>:<button className="sound-add" type="button" disabled={disabled||busy} aria-label={t('Ajouter un son à la piste {number}',{number:index+1})} onClick={()=>{audition.stop();e.select(index);}}><Plus size={17}/>{t('Ajouter un son')}</button>}
    </div>;
   })}
  </div>
  <p className="sound-drag-help">{t('Glisse les blocs pour placer tes sons.')}</p>
  <input hidden ref={file} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.webm" onChange={event=>{const next=event.target.files?.[0];event.target.value='';if(next)void e.chooseFile(next,fileTarget.current);}}/>
  {e.pending?<div className="sound-status" role="status"><LoaderCircle size={17} className="spin"/><span>{t('Chargement du son…')}</span><button className="quiet-button" onClick={e.cancel}>{t('Annuler')}</button></div>:null}
  {capture?<div className="sound-recording"><span role="status">{e.microphone==='waiting'?t('En attente du microphone…'):<>{t('Enregistrement…')} <strong>{seconds(e.elapsed)} / 6 s</strong></>}</span><button className="button secondary" onClick={e.microphone==='recording'?e.stop:e.cancel}>{e.microphone==='recording'?<><Square size={15}/>{t('Arrêter')}</>:t('Annuler')}</button>{e.microphone==='recording'?<button className="quiet-button" onClick={e.cancel}>{t('Annuler')}</button>:null}</div>:null}
  {track?<div className="sound-selected-controls" role="group" aria-label={t('Réglages de la piste {number}',{number})}>
   <div className="sound-excerpt-heading"><strong><Scissors size={16}/>{t('Extrait à utiliser')}</strong><button type="button" disabled={disabled||busy||!clipDuration} onClick={()=>void audition.toggle()} aria-pressed={audition.listening}>{audition.listening?<Square size={15}/>:<Headphones size={16}/>}<span>{audition.listening?t('Arrêter'):t('Écouter l’extrait')}</span></button></div>
   <div className="sound-excerpt-fields">
    <label><span>{t('À partir de')}</span><span className="sound-number"><SoundTime key={`start-${selected}`} label={t('Début de l’extrait de la piste {number}',{number})} value={recipe.start} max={Math.max(0,track.buffer.duration-.01)} disabled={disabled||busy} onChange={value=>changeExcerpt(value,recipe.duration??maxDuration)}/><span>s</span></span></label>
    <label><span>{t('Pendant')}</span><span className="sound-number"><SoundTime key={`duration-${selected}`} label={t('Durée de la piste {number}',{number})} value={clipDuration} max={maxDuration} disabled={disabled||busy||maxDuration<=0} onChange={value=>changeExcerpt(recipe.start,Math.min(maxDuration,value))}/><span>s</span></span></label>
   </div>
   <div className="sound-placement" role="group" aria-label={t('Placer le son')}><button type="button" aria-pressed={Math.abs(recipe.offset)<.015} disabled={disabled||busy} onClick={()=>write(selected,{...recipe,offset:0,afterPrevious:false})}>{t('Au début')}</button>{selected===1&&e.tracks[0]?<button type="button" aria-pressed={sequential} disabled={disabled||busy} onClick={e.sequence}>{t('Après le son 1')}</button>:null}<output>{t('À {time} s dans le sticker',{time:seconds(recipe.offset)})}</output></div>
   <details className="sound-more"><summary>{t('Changer le son et régler le volume')}</summary>{sources}<div className="sound-levels" role="group" aria-label={t('Volume de la piste {number}',{number})}>{[.25,.5,1].map(volume=><button key={volume} type="button" aria-pressed={recipe.volume===volume} disabled={disabled||busy} onClick={()=>write(selected,{...recipe,volume})}>{Math.round(volume*100)} %</button>)}<button type="button" className="sound-remove" disabled={disabled||busy} onClick={()=>{audition.stop();e.remove(selected);}}><Trash2 size={16}/>{t('Retirer le son')}</button></div></details>
  </div>:!busy?<>{sources}<p className="sound-empty">{t('Choisis un audio de moins de 5 Mo et de 30 secondes maximum.')}</p></>:null}
 </div>;
}
