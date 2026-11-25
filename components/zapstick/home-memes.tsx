'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Info,Pause,Play,Volume2,VolumeX} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {HOME_MEMES,HOME_SOUND_MEMES} from '@/lib/stickers/home-memes';
import {registerAudioWork} from '@/lib/stickers/audio';
import styles from './home-memes.module.css';

/** Six local reactions decorate the import surface. Sound is an explicit,
 * single-play gesture; ordinary loops are always muted. */
export function HomeMemes({disabled=false}:{disabled?:boolean}) {
  const {t,reduceMotion}=usePreferences();
  const [mounted,setMounted]=useState(false),[playing,setPlaying]=useState(false),[visible,setVisible]=useState(true);
  const [sound,setSound]=useState<string|null>(null),[error,setError]=useState('');
  const videos=useRef(new Map<string,HTMLVideoElement>()),request=useRef(0);
  const videoRefs=useMemo(()=>Object.fromEntries(HOME_SOUND_MEMES.map(meme=>[meme.id,(node:HTMLVideoElement|null)=>{if(node)videos.current.set(meme.id,node);else{const previous=videos.current.get(meme.id);if(previous){previous.muted=true;previous.pause();previous.removeAttribute('src');previous.load();}videos.current.delete(meme.id);}}])),[]);
  const stopSound=useCallback((pause=false)=>{
    request.current++;
    for(const video of videos.current.values()){video.muted=true;video.loop=true;if(pause)video.pause();}
    setSound(null);
  },[]);
  useEffect(()=>{
    const preference=document.documentElement.dataset.reducedMotion;
    const reduced=preference==='true'||(preference===undefined&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setPlaying(!reduced);setVisible(!document.hidden);setMounted(true);
    const visibility=()=>{setVisible(!document.hidden);if(document.hidden)stopSound(true);};
    const pagehide=()=>stopSound(true),unregister=registerAudioWork(pagehide),media=videos.current;
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',pagehide);
    return()=>{unregister();request.current++;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',pagehide);for(const video of media.values()){video.muted=true;video.pause();video.removeAttribute('src');video.load();}};
  },[stopSound]);
  useEffect(()=>{if(reduceMotion){setPlaying(false);stopSound(true);}},[reduceMotion,stopSound]);
  useEffect(()=>{if(disabled)stopSound(true);},[disabled,stopSound]);
  const animated=mounted&&playing&&!disabled&&visible;
  useEffect(()=>{
    if(!animated){stopSound(true);return;}
    for(const video of videos.current.values()){video.muted=true;video.loop=true;void video.play().catch(()=>{});}
  },[animated,stopSound]);
  async function hear(id:string){
    if(disabled)return;
    setError('');
    if(sound===id){stopSound(!animated);return;}
    stopSound(!animated);
    const video=videos.current.get(id);if(!video)return;
    const current=request.current;
    video.loop=false;video.muted=false;video.currentTime=0;setSound(id);
    try{await video.play();}
    catch{if(request.current===current){stopSound(true);setError('Impossible de lire ce son.');}}
  }
  const running=animated||sound!==null;
  const motionLabel=running?t('Mettre les animations en pause'):t('Lire les animations');
  return <div className={styles.decor}>
    <div className={styles.reactions}>
      {HOME_MEMES.map((meme,index)=>{
        const sounding=HOME_SOUND_MEMES.find(item=>item.id===meme.id);
        if(!sounding)return <span className={`${styles.reaction} ${styles.silent} ${styles[`reaction${index}`]}`} key={meme.id} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={animated?meme.src:meme.poster} alt="" width={160} height={120} draggable={false} decoding="async"/>
        </span>;
        const selected=sound===meme.id,showVideo=animated||selected;
        const label=selected?t('Couper le son de {name}',{name:t(meme.name)}):t('Écouter {name}',{name:t(meme.name)});
        return <button type="button" className={`${styles.reaction} ${styles[`reaction${index}`]} ${selected?styles.audible:''}`} key={meme.id} onClick={()=>void hear(meme.id)} aria-label={label} title={label} aria-pressed={selected} disabled={disabled}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={meme.poster} alt="" width={160} height={120} draggable={false} decoding="async" hidden={showVideo}/>
          <video ref={videoRefs[meme.id]} src={mounted?sounding.video:undefined} poster={meme.poster} muted={!selected} loop={!selected} autoPlay={animated} playsInline preload="metadata" hidden={!showVideo} aria-hidden="true" onEnded={event=>{const video=event.currentTarget;video.muted=true;video.loop=true;setSound(null);if(animated)void video.play().catch(()=>{});else video.pause();}}/>
          <span className={styles.soundBadge} aria-hidden="true">{selected?<VolumeX size={12}/>:<Volume2 size={12}/>}<span>{t('Son')}</span></span>
        </button>;
      })}
    </div>
    <button type="button" className={styles.motion} disabled={disabled} onClick={()=>{setError('');if(running){setPlaying(false);stopSound(true);}else setPlaying(true);}} aria-label={motionLabel} title={motionLabel}>
      {running?<Pause size={16} aria-hidden="true"/>:<Play size={16} aria-hidden="true"/>}
    </button>
    <a className={styles.credits} href="/memes/SOURCES.txt" target="_blank" rel="noopener noreferrer" aria-label={t('Crédits des médias')} title={t('Crédits des médias')}><Info size={14} aria-hidden="true"/></a>
    {error?<span className={styles.error} role="status">{t(error)}</span>:null}
  </div>;
}
