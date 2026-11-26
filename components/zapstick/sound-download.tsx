'use client';

import {useEffect, useRef, useState} from 'react';
import {Download, LoaderCircle} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {download} from '@/lib/stickers/store';
import type {Sticker} from '@/lib/stickers/types';
import type {SoundVideo} from '@/lib/stickers/sound-export';
import './sound-download.css';

type Props = {sticker: Sticker; onBusy?: (busy: boolean) => void; disabled?: boolean};
type PreparedVideo = SoundVideo & {visual: Blob; sound: Blob};

export function SoundDownload({sticker, onBusy, disabled = false}: Props) {
  const {t} = usePreferences();
  const [progress, setProgress] = useState<{value: number; visual: Blob; sound: Blob} | null>(null);
  const [error, setError] = useState('');
  const operation = useRef<AbortController | null>(null);
  const cached = useRef<PreparedVideo | null>(null);
  const onBusyRef = useRef(onBusy);
  useEffect(() => { onBusyRef.current = onBusy; }, [onBusy]);
  const visual = sticker.blob, sound = sticker.sound?.blob;

  useEffect(() => () => {
    operation.current?.abort();operation.current = null;
    cached.current = null;
    onBusyRef.current?.(false);
  }, [visual, sound]);

  const percent = progress && progress.visual === visual && progress.sound === sound ? progress.value : null;
  const safeName = sticker.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'sticker';
  async function save() {
    if (!visual || !sound || disabled || operation.current) return;
    if (cached.current?.visual === visual && cached.current.sound === sound) {
      download(cached.current.blob, `${safeName}.${cached.current.extension}`);return;
    }
    const controller = new AbortController();
    operation.current = controller;setProgress({value: 0, visual, sound});setError('');onBusyRef.current?.(true);
    try {
      const [{decodeAudio}, {exportSoundVideo}] = await Promise.all([
        import('@/lib/stickers/audio'), import('@/lib/stickers/sound-export'),
      ]);
      if (controller.signal.aborted) return;
      const track = await decodeAudio(sound, {signal: controller.signal});
      const video = await exportSoundVideo(visual, track.buffer, {
        signal: controller.signal,
        onProgress: value => { if (!controller.signal.aborted) setProgress({value: Math.round(value), visual, sound}); },
      });
      if (controller.signal.aborted) return;
      cached.current = {...video, visual, sound};
      download(video.blob, `${safeName}.${video.extension}`);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Impossible de préparer la vidéo avec son. Essaie un autre navigateur.');
    } finally {
      if (operation.current === controller) {
        operation.current = null;setProgress(null);onBusyRef.current?.(false);
      }
    }
  }

  if (!visual || !sound) return null;
  return <div className="sound-download" aria-busy={percent !== null}>
    <button type="button" className="button secondary full-width" onClick={save} disabled={disabled || percent !== null}>
      {percent !== null ? <LoaderCircle className="spin" size={18} aria-hidden="true"/> : <Download size={18} aria-hidden="true"/>}
      {percent !== null ? `${t('Préparation…')} ${percent} %` : t('Enregistrer')}
    </button>
    {percent !== null ? <><p className="sr-only" role="status">{`${t('Préparation…')} ${percent} %`}</p><button type="button" className="quiet-button" onClick={() => operation.current?.abort()}>{t('Annuler')}</button></> : null}
    {error ? <p className="sound-download-error" role="alert">{t(error)}</p> : null}
  </div>;
}
