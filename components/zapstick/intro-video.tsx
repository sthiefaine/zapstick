'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {Play} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {LOCALE_NAMES,type Locale} from '@/lib/i18n/config';
import {registerAudioWork} from '@/lib/stickers/audio';
import {claimPeerMedia,registerPeerMedia} from '@/lib/stickers/peer-media';
import styles from './intro-video.module.css';

/** A locale change remounts the player, so an old language can never keep playing. */
export function IntroVideo({active}:{active:boolean}){
 const {locale}=usePreferences();
 return <IntroPlayer key={locale} language={locale} active={active}/>;
}

function IntroPlayer({language,active}:{language:Locale;active:boolean}){
 const {t}=usePreferences(),container=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null),inView=useRef(true),request=useRef(0);
 const [peer]=useState(()=>Symbol('zapstick-intro')),[started,setStarted]=useState(false),[error,setError]=useState(false);
 const base=`/videos/zapstick-intro-${language.toLowerCase()}`,captionLocale=language;
 const asset=(extension:string)=>`${base}.${extension}?v=4`;
 const pause=useCallback(()=>{request.current++;video.current?.pause();},[]);
 useEffect(()=>{
  const media=video.current,hide=()=>{if(document.hidden)pause();};
  const unregisterPeer=registerPeerMedia(peer,pause),unregisterAudio=registerAudioWork(pause);
  document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',pause);
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{
   inView.current=entries.some(entry=>entry.isIntersecting&&entry.intersectionRatio>=.05);
   if(!inView.current)pause();
  },{threshold:[0,.05]});
  if(container.current)observer?.observe(container.current);
  return()=>{
   unregisterPeer();unregisterAudio();observer?.disconnect();
   document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',pause);
   request.current++;
   if(media){media.pause();media.removeAttribute('src');media.load();}
  };
 },[peer,pause]);
 useEffect(()=>{if(!active)pause();},[active,pause]);
 function fail(){pause();setError(true);setStarted(false);video.current?.removeAttribute('src');}
 async function play(){
  const media=video.current;
  if(!media||!active||document.hidden||!inView.current)return;
  const current=++request.current;
  setError(false);setStarted(true);claimPeerMedia(peer);
  // Attach the source inside the click gesture. No MP4 is requested on arrival.
  if(media.getAttribute('src')!==asset('mp4')){media.src=asset('mp4');media.load();}
  media.volume=.8;
  try{await media.play();}
  catch{if(request.current===current)fail();}
 }
 return <div className={styles.card} ref={container}>
  <div className={styles.frame}>
   <video ref={video} className={styles.video} hidden={!started} controls playsInline preload="none" poster={asset('jpg')} lang={captionLocale} aria-label={t('Film de présentation de Zapstick')} onPlay={()=>{
    if(!active||document.hidden||!inView.current){pause();return;}
    claimPeerMedia(peer);
   }} onError={fail}>
    {started?<track kind="captions" src={asset('vtt')} srcLang={captionLocale} label={LOCALE_NAMES[captionLocale]}/>:null}
   </video>
   {!started?<button type="button" className={styles.launch} disabled={!active} onClick={()=>void play()} aria-label={t('Lire le film de présentation de Zapstick')}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={styles.poster} src={asset('jpg')} alt="" width={1280} height={720} loading="lazy" decoding="async"/>
    <span className={styles.play} aria-hidden="true"><Play size={29} fill="currentColor"/></span>
    <span className={styles.caption}><strong className="sr-only">{t('Découvrir Zapstick')}</strong><span>30 s</span></span>
   </button>:null}
  </div>
  {error?<p className={styles.error} role="status">{t('Impossible de lire cette vidéo.')}</p>:null}
 </div>;
}
