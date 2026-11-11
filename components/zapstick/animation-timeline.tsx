'use client';
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { LoaderCircle, Pause, Play } from 'lucide-react';
import { usePreferences } from '@/components/preferences-provider';
import { formatTimelineTime, moveTrimHandle, normalizeTrim, type TrimSelection } from '@/lib/stickers/timeline';
import type { AnimationPreview } from '@/lib/stickers/animation-preview';
import './animation-timeline.css';

type Props = {
 duration: number;
 selection: TrimSelection;
 thumbnails: string[];
 currentTime: number;
 playing: boolean;
 disabled?: boolean;
 loading?: boolean;
 onChange: (selection: TrimSelection, previewTime: number) => void;
 onSeek: (time: number) => void;
 onTogglePlay: () => void;
};
export function AnimationTimeline({ duration, selection, thumbnails, currentTime, playing, disabled = false, loading = false, onChange, onSeek, onTogglePlay }: Props) {
 const { t, locale } = usePreferences(), track = useRef<HTMLDivElement>(null);
 const drag = useRef<{ edge: 'start' | 'end'; pointer: number; x:number; time:number } | null>(null);
 const trim = normalizeTrim(duration, selection.start, selection.duration), end = trim.start + trim.duration;
 const fraction = (time: number) => duration ? Math.max(0, Math.min(100, time / duration * 100)) : 0;
 const selectedSeconds = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(trim.duration);
 function move(edge: 'start' | 'end', value: number) {
  const next = moveTrimHandle(duration, trim, edge, value);
  onChange(next, edge === 'start' ? next.start : Math.max(next.start, next.start + next.duration - .01));
 }
 function timeAt(event: PointerEvent<HTMLElement>) {
  const rect = track.current!.getBoundingClientRect();
  return Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration));
 }
 function pointerDown(event: PointerEvent<HTMLButtonElement>, edge: 'start' | 'end') {
  event.preventDefault(); event.stopPropagation();
  event.currentTarget.focus({ preventScroll: true });
  drag.current = { edge, pointer: event.pointerId, x:event.clientX, time:edge==='start'?trim.start:end };
  event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.focus({preventScroll:true});
 }
 function keyDown(event: KeyboardEvent<HTMLButtonElement>, edge: 'start' | 'end') {
  const current = edge === 'start' ? trim.start : end, step = event.shiftKey ? 1 : .1;
  const values: Record<string, number> = { ArrowLeft: current - step, ArrowDown: current - step, ArrowRight: current + step, ArrowUp: current + step, PageDown: current - 1, PageUp: current + 1, Home: 0, End: duration };
  if (Object.hasOwn(values, event.key)) { event.preventDefault(); move(edge, values[event.key]); }
 }
 return <div className="animation-timeline" aria-label={t('Découper l’animation')}>
  <div className="timeline-heading">
   <button className="timeline-play" type="button" disabled={disabled || !duration} aria-label={playing ? t('Mettre en pause') : t('Lire l’animation')} onClick={onTogglePlay}>{playing ? <Pause size={17} aria-hidden="true"/> : <Play size={17} aria-hidden="true"/>}</button>
   <output className="timeline-current">{formatTimelineTime(currentTime)}<span> / {formatTimelineTime(duration)}</span></output>
   <span className="timeline-duration">{t('{duration} s sélectionnées', { duration: selectedSeconds })}</span>
  </div>
  <div className="timeline-filmstrip" ref={track} onPointerDown={event => { if (!disabled && duration) onSeek(timeAt(event)); }}>
   <div className="timeline-thumbnails" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div key={index}>{thumbnails[index] ? <img src={thumbnails[index]} alt="" draggable={false}/> : null}</div>)}</div>
   <div className="timeline-dim timeline-dim-left" style={{ width: `${fraction(trim.start)}%` }}/><div className="timeline-dim timeline-dim-right" style={{ width: `${100 - fraction(end)}%` }}/>
   <div className="timeline-selection" style={{ left: `${fraction(trim.start)}%`, width: `${fraction(trim.duration)}%` }} aria-hidden="true"/>
   <span className="timeline-playhead" style={{ left: `${fraction(currentTime)}%` }} aria-hidden="true"/>
   {(['start', 'end'] as const).map(edge => <button key={edge} type="button" className={`timeline-handle timeline-handle-${edge}`} role="slider" aria-label={edge === 'start' ? t('Début de la sélection') : t('Fin de la sélection')} aria-valuemin={0} aria-valuemax={duration} aria-valuenow={edge === 'start' ? trim.start : end} aria-valuetext={t('{time} secondes', { time: (edge === 'start' ? trim.start : end).toFixed(2) })} disabled={disabled || !duration} style={{ left: `${fraction(edge === 'start' ? trim.start : end)}%` }} onKeyDown={event => keyDown(event, edge)} onPointerDown={event => pointerDown(event, edge)} onPointerMove={event => { const current=drag.current, width=track.current?.getBoundingClientRect().width;if(current?.pointer===event.pointerId&&width)move(current.edge,current.time+(event.clientX-current.x)/width*duration); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}><span aria-hidden="true"/></button>)}
   {loading ? <div className="timeline-loading" role="status"><LoaderCircle size={18} className="spin" aria-hidden="true"/><span className="sr-only">{t('Préparation de la timeline…')}</span></div> : null}
  </div>
  <div className="timeline-scale" aria-hidden="true">{[0, .25, .5, .75, 1].map(fraction => <span key={fraction}>{formatTimelineTime(duration * fraction)}</span>)}</div>
  <label className="timeline-scrubber"><span className="sr-only">{t('Position de lecture')}</span><input type="range" min={0} max={duration || 1} step="0.01" value={Math.min(currentTime, duration)} disabled={disabled || !duration} aria-valuetext={t('{time} secondes', { time: currentTime.toFixed(2) })} onChange={event => onSeek(Number(event.target.value))}/></label>
  <div className="timeline-limits"><span>{t('Début')} <strong>{formatTimelineTime(trim.start)}</strong></span><span>{t('6 s max.')}</span><span>{t('Fin')} <strong>{formatTimelineTime(end)}</strong></span></div>
 </div>;
}

export function GifAnimationCanvas({ preview, playing, active, start, length, seek, onTimeUpdate, onError, style, label }: { preview: AnimationPreview; playing: boolean; active: boolean; start: number; length: number; seek: { time: number; revision: number }; onTimeUpdate: (time: number) => void; onError: (error: unknown) => void; style: CSSProperties; label: string }) {
 const canvas = useRef<HTMLCanvasElement>(null), lastTime = useRef(seek.time);
 const callbacks = useRef({ onTimeUpdate, onError });
 callbacks.current = { onTimeUpdate, onError };
 useEffect(() => { lastTime.current = seek.time; }, [seek]);
 useEffect(() => {
  let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
  const initial = lastTime.current >= start && lastTime.current < start + length ? lastTime.current : start, began = performance.now();
  async function render() {
   if (!canvas.current || !preview.drawAt || cancelled) return;
   const time = playing && active && length > 0 ? start + ((initial - start + (performance.now() - began) / 1000) % length) : seek.time;
   try { await preview.drawAt(canvas.current, time); if (cancelled) return; lastTime.current = time; callbacks.current.onTimeUpdate(time); }
   catch (error) { if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) callbacks.current.onError(error); }
   if (!cancelled && playing && active) timer = setTimeout(render, 60);
  }
  void render();
  return () => { cancelled = true; clearTimeout(timer); };
 }, [preview, playing, active, start, length, seek]);
 return <canvas className="stage-media" ref={canvas} width={0} height={0} role="img" aria-label={label} style={style}/>;
}
