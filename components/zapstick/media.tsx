'use client';
import {useEffect,useRef,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import type {Sticker} from '@/lib/stickers/types';
import {loadImage} from '@/lib/stickers/convert';
import {usePreferences} from '@/components/preferences-provider';
export function useMediaUrl(blob?:Blob,src?:string){
 const [url,setUrl]=useState(src??'');
 useEffect(()=>{if(!blob){setUrl(src??'');return;}const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[blob,src]);
 return url;
}
export function Media({sticker,className='',active=true}:{sticker:Sticker;className?:string;active?:boolean}){
 const {reduceMotion}=usePreferences(),url=useMediaUrl(sticker.blob,sticker.src),video=useRef<HTMLVideoElement>(null);
 const [still,setStill]=useState(''),[mounted,setMounted]=useState(false);
 useEffect(()=>{setMounted(true);},[]);
 useEffect(()=>{const v=video.current;if(!v)return;if(active&&mounted&&!reduceMotion)v.play().catch(()=>{});else v.pause();},[active,mounted,reduceMotion,url]);
 useEffect(()=>{let cancelled=false;setStill('');if(reduceMotion&&sticker.kind==='animated'&&sticker.mime.startsWith('image/')&&url){loadImage(url).then(image=>{if(cancelled)return;const canvas=document.createElement('canvas'),ratio=Math.min(512/image.naturalWidth,512/image.naturalHeight,1);canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));canvas.getContext('2d')!.drawImage(image,0,0,canvas.width,canvas.height);setStill(canvas.toDataURL('image/png'));}).catch(()=>{});}return()=>{cancelled=true;};},[reduceMotion,sticker.kind,sticker.mime,url]);
 return url?sticker.mime.startsWith('video/')?<video ref={video} className={className} src={url} muted autoPlay={active&&mounted&&!reduceMotion} loop playsInline preload="metadata" aria-label={sticker.name}/>:<img className={className} src={still||url} alt={sticker.name} loading="lazy" draggable={false}/>:<LoaderCircle className="spin" size={20}/>;
}
export async function mediaBlob(sticker:Sticker){if(sticker.blob)return sticker.blob;if(!sticker.src)throw new Error('Le média est introuvable.');const r=await fetch(sticker.src);if(!r.ok)throw new Error('Impossible de charger ce média.');return r.blob();}
