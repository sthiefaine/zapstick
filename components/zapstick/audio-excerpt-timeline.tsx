'use client';

import {useEffect,useId,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent,type PointerEvent} from 'react';
import {usePreferences} from '@/components/preferences-provider';
import {formatTimelineTime} from '@/lib/stickers/timeline';
import {moveAudioExcerpt,moveAudioExcerptHandle,normalizeAudioExcerpt,type AudioExcerpt,type AudioExcerptEdge} from '@/lib/stickers/audio-timeline';
import styles from './audio-excerpt-timeline.module.css';

type Props={buffer:AudioBuffer;selection:AudioExcerpt;maximum:number;trackNumber:number;disabled:boolean;onChange:(selection:AudioExcerpt)=>void};
type Drag={pointer:number;kind:AudioExcerptEdge|'region';x:number;selection:AudioExcerpt};

function PreciseTime({value,max,label,disabled,onChange}:{value:number;max:number;label:string;disabled:boolean;onChange:(value:number)=>void}){
 const [draft,setDraft]=useState(String(Math.round(value*100)/100)),focused=useRef(false);
 useEffect(()=>{if(!focused.current)setDraft(String(Math.round(value*100)/100));},[value]);
 return <input type="number" inputMode="decimal" aria-label={label} min={0} max={Math.round(max*100)/100} step="any" value={draft} disabled={disabled} onFocus={()=>{focused.current=true;}} onChange={event=>{const next=event.target.value;setDraft(next);if(next!==''&&Number.isFinite(Number(next)))onChange(Number(next));}} onBlur={()=>{focused.current=false;const next=draft===''||!Number.isFinite(Number(draft))?value:Math.max(0,Math.min(max,Number(draft)));setDraft(String(Math.round(next*100)/100));onChange(next);}}/>;
}

/** The complete source waveform trims an excerpt; the two montage blocks place it. */
export function AudioExcerptTimeline({buffer,selection,maximum,trackNumber,disabled,onChange}:Props){
 const {t,locale}=usePreferences(),help=useId(),track=useRef<HTMLDivElement>(null),drag=useRef<Drag|null>(null);
 const total=buffer.duration,current=normalizeAudioExcerpt(total,selection,maximum),end=current.start+current.duration;
 const blocked=disabled||!current.duration,percent=(time:number)=>total?Math.max(0,Math.min(100,time/total*100)):0;
 const seconds=(value:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value);
 const peaks=useMemo(()=>{
  const channels=Array.from({length:buffer.numberOfChannels},(_,channel)=>buffer.getChannelData(channel)),step=Math.max(1,Math.floor(buffer.length/80));
  return Array.from({length:80},(_,index)=>{let peak=0;for(let sample=index*step;sample<Math.min(buffer.length,(index+1)*step);sample+=Math.max(1,Math.floor(step/48)))for(const channel of channels)peak=Math.max(peak,Math.abs(channel[sample]??0));return peak;});
 },[buffer]);
 const largest=Math.max(.01,...peaks);
 function down(event:PointerEvent<HTMLButtonElement>,kind:Drag['kind']){
  if(blocked)return;
  event.preventDefault();event.stopPropagation();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
  drag.current={pointer:event.pointerId,kind,x:event.clientX,selection:current};
 }
 function move(event:PointerEvent<HTMLButtonElement>){
  const held=drag.current,width=track.current?.getBoundingClientRect().width;
  if(!held||held.pointer!==event.pointerId||!width||blocked)return;
  const delta=(event.clientX-held.x)/width*total;
  onChange(held.kind==='region'?moveAudioExcerpt(total,held.selection,held.selection.start+delta,maximum):moveAudioExcerptHandle(total,held.selection,held.kind,(held.kind==='start'?held.selection.start:held.selection.start+held.selection.duration)+delta,maximum));
 }
 function release(event:PointerEvent<HTMLButtonElement>){
  drag.current=null;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 }
 function key(event:KeyboardEvent<HTMLButtonElement>,kind:Drag['kind']){
  if(blocked)return;
  const position=kind==='end'?end:current.start,step=event.shiftKey?1:.1;
  const values:Record<string,number>={ArrowLeft:position-step,ArrowDown:position-step,ArrowRight:position+step,ArrowUp:position+step,PageDown:position-1,PageUp:position+1,Home:0,End:total};
  if(!Object.hasOwn(values,event.key))return;
  event.preventDefault();onChange(kind==='region'?moveAudioExcerpt(total,current,values[event.key],maximum):moveAudioExcerptHandle(total,current,kind,values[event.key],maximum));
 }
 const gestures=(kind:Drag['kind'])=>({onPointerDown:(event:PointerEvent<HTMLButtonElement>)=>down(event,kind),onPointerMove:move,onPointerUp:release,onPointerCancel:release,onLostPointerCapture:()=>{drag.current=null;},onKeyDown:(event:KeyboardEvent<HTMLButtonElement>)=>key(event,kind)});
 return <div className={styles.timeline} role="group" aria-label={t('Découper le son')} style={{'--excerpt-color':trackNumber===2?'var(--pop-coral)':'var(--pop-blue)'} as CSSProperties}>
  <span id={help} className="sr-only">{t('Glisse la zone pour choisir le passage. Les poignées règlent son début et sa fin.')}</span>
  <div className={styles.summary}><output>{formatTimelineTime(current.start)} <span>–</span> {formatTimelineTime(end)}</output><span>{t('{duration} s sélectionnées',{duration:seconds(current.duration)})}</span></div>
  <div className={styles.padding}>
   <div className={styles.wave} ref={track}>
    <div className={styles.bars} aria-hidden="true">{peaks.map((peak,index)=><i key={index} style={{height:`${Math.max(6,peak/largest*84)}%`}}/>)}</div>
    <div className={`${styles.dim} ${styles.before}`} style={{width:`${percent(current.start)}%`}} aria-hidden="true"/>
    <div className={`${styles.dim} ${styles.after}`} style={{width:`${100-percent(end)}%`}} aria-hidden="true"/>
    <button type="button" className={styles.region} aria-label={t('Déplacer l’extrait audio')} aria-describedby={help} disabled={blocked} style={{left:`${percent(current.start)}%`,width:`${percent(current.duration)}%`}} {...gestures('region')}/>
    {(['start','end'] as const).map(edge=><button type="button" key={edge} className={`${styles.handle} ${edge==='start'?styles.start:styles.end}`} role="slider" aria-label={edge==='start'?t('Début de l’extrait de la piste {number}',{number:trackNumber}):t('Fin de l’extrait de la piste {number}',{number:trackNumber})} aria-describedby={help} aria-valuemin={0} aria-valuemax={total} aria-valuenow={edge==='start'?current.start:end} aria-valuetext={t('{time} secondes',{time:seconds(edge==='start'?current.start:end)})} disabled={blocked} style={{left:`${percent(edge==='start'?current.start:end)}%`}} {...gestures(edge)}><span aria-hidden="true"/></button>)}
   </div>
   <div className={styles.scale} aria-hidden="true"><span>0 s</span><span>{seconds(total/2)} s</span><span>{seconds(total)} s</span></div>
  </div>
  <details className={styles.precision}><summary>{t('Précision')}</summary><div>
   <label><span>{t('Début')}</span><span className={styles.number}><PreciseTime value={current.start} max={Math.max(0,total-.01)} label={t('Début précis de l’extrait de la piste {number}',{number:trackNumber})} disabled={blocked} onChange={start=>onChange(normalizeAudioExcerpt(total,{start,duration:current.duration},maximum))}/><span>s</span></span></label>
   <label><span>{t('Fin')}</span><span className={styles.number}><PreciseTime value={end} max={total} label={t('Fin précise de l’extrait de la piste {number}',{number:trackNumber})} disabled={blocked} onChange={value=>onChange(moveAudioExcerptHandle(total,current,'end',value,maximum))}/><span>s</span></span></label>
  </div></details>
 </div>;
}
