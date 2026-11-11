'use client';
import {useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import type {Sticker} from '@/lib/stickers/types';
export function useMediaUrl(blob?:Blob,src?:string){
 const [url,setUrl]=useState(src??'');
 useEffect(()=>{if(!blob){setUrl(src??'');return;}const u=URL.createObjectURL(blob);setUrl(u);return()=>URL.revokeObjectURL(u);},[blob,src]);
 return url;
}
export function Media({sticker,className='',active=true}:{sticker:Sticker;className?:string;active?:boolean}){
 const url=useMediaUrl(sticker.blob,sticker.src);
 return url?sticker.mime.startsWith('video/')?<video className={className} src={url} muted autoPlay={active} loop playsInline preload="metadata" aria-label={sticker.name}/>:<img className={className} src={url} alt={sticker.name} loading="lazy" draggable={false}/>:<LoaderCircle className="spin" size={20}/>;
}
export async function mediaBlob(sticker:Sticker){if(sticker.blob)return sticker.blob;if(!sticker.src)throw new Error('Le média est introuvable.');const r=await fetch(sticker.src);if(!r.ok)throw new Error('Impossible de charger ce média.');return r.blob();}
