'use client';

import {useEffect, useRef, useState} from 'react';
import {Volume2, VolumeX} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import type {Sticker} from '@/lib/stickers/types';
import {Media, useMediaUrl} from './media';

export function StickerPreview({sticker, active = true, className = ''}: {sticker: Sticker; active?: boolean; className?: string}) {
  const {t} = usePreferences(), audio = useRef<HTMLAudioElement>(null);
  const soundUrl = useMediaUrl(sticker.sound?.blob);
  const [playing, setPlaying] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => { const player = audio.current; player?.pause(); setPlaying(false); return () => { player?.pause(); }; }, [soundUrl, active]);
  async function toggle() {
    const player = audio.current;
    if (!player || !active) return;
    if (!player.paused) { player.pause(); return; }
    player.currentTime = 0; setRevision(value => value + 1);
    try { await player.play(); } catch { setPlaying(false); }
  }
  return <>
    <Media key={revision} sticker={sticker} active={active} className={className}/>
    {soundUrl ? <><audio hidden ref={audio} src={soundUrl} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setPlaying(false)}/><button type="button" className="sticker-listen" aria-label={t(playing ? 'Couper le son de {name}' : 'Écouter {name}', {name: sticker.name})} aria-pressed={playing} onClick={toggle}>{playing ? <VolumeX size={20}/> : <Volume2 size={20}/>}</button></> : null}
  </>;
}
