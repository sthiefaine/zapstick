'use client';

import {useEffect,useState} from 'react';
import {Pause,Play} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {homeMemesTranslations} from '@/lib/i18n/home-memes-translations';
import {HOME_MEMES} from '@/lib/stickers/home-memes';
import styles from './home-memes.module.css';

/** Decorative local GIFs, mounted beside (never inside) the import button.
 * The server and reduced-motion users receive static local posters. */
export function HomeMemes({disabled=false}:{disabled?:boolean}) {
  const {locale,reduceMotion}=usePreferences();
  const [mounted,setMounted]=useState(false);
  const [playing,setPlaying]=useState(false);
  useEffect(()=>{
    const preference=document.documentElement.dataset.reducedMotion;
    const reduced=preference==='true'||(preference===undefined&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setPlaying(!reduced);
    setMounted(true);
  },[]);
  useEffect(()=>{if(reduceMotion)setPlaying(false);},[reduceMotion]);
  const animated=mounted&&playing&&!disabled;
  const source=animated?'Mettre les GIF en pause':'Lire les GIF';
  const label=homeMemesTranslations[locale][source]??source;
  return <div className={styles.decor}>
    <div aria-hidden="true" className={styles.reactions}>
      {HOME_MEMES.map((meme,index)=><span className={`${styles.reaction} ${styles[`reaction${index}`]}`} key={meme.id}>
        {/* Native GIFs stay local and can be replaced with still posters. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={animated?meme.src:meme.poster} alt="" width={160} height={160} draggable={false} decoding="async"/>
      </span>)}
    </div>
    <button type="button" className={styles.motion} disabled={disabled} onClick={()=>setPlaying(!animated)} aria-label={label} title={label}>
      {animated?<Pause size={16} aria-hidden="true"/>:<Play size={16} aria-hidden="true"/>}
    </button>
  </div>;
}
