'use client';
import {useEffect,useId,useRef,useState,type PointerEvent} from 'react';
import {hexToHsv,hsvToHex,wheelColor,type HSV} from '@/lib/stickers/color';
import {usePreferences} from '@/components/preferences-provider';
import styles from './color-wheel.module.css';

export function ColorWheel({value,onChange,disabled=false}:{value:string;onChange:(color:string)=>void;disabled?:boolean}){
 const{t}=usePreferences(),id=useId();
 const [color,setColor]=useState<HSV>(()=>hexToHsv(value)??hexToHsv('#bfe8b0')!),[hex,setHex]=useState(value==='transparent'?'#bfe8b0':value);
 const current=useRef(color),published=useRef(value);
 useEffect(()=>{if(value===published.current)return;published.current=value;const next=hexToHsv(value);if(next){current.current={...next,h:next.s?next.h:current.current.h};setColor(current.current);setHex(value);}},[value]);
 function commit(next:HSV){current.current=next;setColor(next);const text=hsvToHex(next);published.current=text;setHex(text);onChange(text);}
 function point(e:PointerEvent<HTMLDivElement>){const rect=e.currentTarget.getBoundingClientRect(),previous=current.current;commit({...previous,...wheelColor(e.clientX-rect.left,e.clientY-rect.top,rect.width),v:previous.v===0?1:previous.v});}
 const angle=(color.h-90)*Math.PI/180;
 return <div className={styles.picker}>
  <div className={styles.wheel} role="slider" tabIndex={disabled?-1:0} aria-label={t('Roue des couleurs')} aria-describedby={`${id}-help`} aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(color.h)} aria-valuetext={hsvToHex(color)} aria-disabled={disabled} style={{opacity:disabled?.5:1}}
   onPointerDown={e=>{if(disabled||e.button!==0)return;e.preventDefault();e.currentTarget.focus({preventScroll:true});e.currentTarget.setPointerCapture(e.pointerId);point(e);}}
   onPointerMove={e=>{if(!disabled&&e.currentTarget.hasPointerCapture(e.pointerId))point(e);}}
   onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onKeyDown={e=>{if(disabled)return;const step=e.shiftKey?10:2;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const previous=current.current,hue=['ArrowLeft','ArrowRight','Home','End'].includes(e.key);commit({...previous,h:e.key==='Home'?0:e.key==='End'?359:(previous.h+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0)+360)%360,s:Math.max(0,Math.min(1,(hue&&previous.s===0?.5:previous.s)+(e.key==='ArrowUp'?.05:e.key==='ArrowDown'?-.05:0))),v:previous.v===0?1:previous.v});}}}>
   <span className={styles.shade} style={{opacity:1-color.v}}/>
   <span className={styles.handle} style={{left:`${50+Math.cos(angle)*color.s*50}%`,top:`${50+Math.sin(angle)*color.s*50}%`,background:hsvToHex(color)}}/>
  </div>
  <span className="sr-only" id={`${id}-help`}>{t('Flèches gauche et droite : teinte. Haut et bas : saturation.')}</span>
  <div className={styles.controls}>
   <label htmlFor={`${id}-brightness`}>{t('Luminosité')}<input id={`${id}-brightness`} type="range" min="0" max="100" value={Math.round(color.v*100)} disabled={disabled} onChange={e=>commit({...color,v:Number(e.target.value)/100})}/></label>
   <label htmlFor={`${id}-hex`}>{t('Couleur')}<span className={styles.hex}><i style={{background:hsvToHex(color)}} aria-hidden="true"/><input id={`${id}-hex`} value={hex} maxLength={7} spellCheck={false} autoComplete="off" aria-label={t('Code couleur hexadécimal')} disabled={disabled} onChange={e=>{setHex(e.target.value);const next=hexToHsv(e.target.value);if(next)commit(next);}} onBlur={()=>setHex(hsvToHex(color))}/></span></label>
  </div>
 </div>;
}
