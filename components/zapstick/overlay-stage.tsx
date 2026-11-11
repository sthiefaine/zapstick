'use client';

import {useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent} from 'react';
import {usePreferences} from '@/components/preferences-provider';
import {layoutText, moveEmoji, normalizeEmojis, normalizeTextStyle, paintOverlays, type EmojiOverlay, type TextLayout} from '@/lib/stickers/overlays';
import type {OverlayControlProps} from './text-style-controls';
import styles from './text-style-controls.module.css';

type Props = OverlayControlProps & {interactive?: boolean};
type Drag = {pointerId: number; id: string; clientX: number; clientY: number; x: number; y: number};
const EMPTY_EMOJIS: readonly EmojiOverlay[] = [];

/** Mount as a direct child of `.stage`, after the source image/video. Empty space
 * stays transparent to crop gestures; each overlay stops its own pointer events. */
export function OverlayStage({text, textStyle, emojis = EMPTY_EMOJIS, selectedId, onSelect, onChangeTextStyle, onChangeEmojis, disabled = false, interactive = true}: Props) {
  const {t} = usePreferences(), helpId = useId();
  const canvas = useRef<HTMLCanvasElement>(null), layer = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null);
  const [textBounds, setTextBounds] = useState<TextLayout | null>(null);
  const style = normalizeTextStyle(textStyle), items = normalizeEmojis(emojis);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 512, 512);
    paintOverlays(ctx, {text, textStyle, emojis});
    setTextBounds(layoutText(ctx, {text, textStyle}));
  }, [text, textStyle, emojis]);

  function move(id: string, x: number, y: number) {
    if (id === 'text') {
      const halfWidth = (textBounds?.width ?? 40) / 2, halfHeight = (textBounds?.height ?? 40) / 2;
      onChangeTextStyle(normalizeTextStyle({...style,
        x: Math.max(halfWidth + 4, Math.min(508 - halfWidth, x)),
        y: Math.max(halfHeight + 4, Math.min(508 - halfHeight, y))}));
    } else onChangeEmojis(items.map(item => item.id === id ? moveEmoji(item, x, y) : item));
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>, id: string, x: number, y: number) {
    if (disabled) return;
    event.stopPropagation();event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({preventScroll: true});onSelect(id);
    drag.current = {pointerId: event.pointerId, id, clientX: event.clientX, clientY: event.clientY, x, y};
  }
  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const current = drag.current, width = layer.current?.getBoundingClientRect().width ?? 0;
    if (!current || current.pointerId !== event.pointerId || disabled || !width) return;
    move(current.id, current.x + (event.clientX - current.clientX) * 512 / width, current.y + (event.clientY - current.clientY) * 512 / width);
  }
  function pointerEnd(event: PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, id: string, x: number, y: number) {
    event.stopPropagation();
    if (disabled) return;
    const step = event.shiftKey ? 20 : 5;
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      move(id, x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
    } else if (event.key === 'Escape') { event.preventDefault();onSelect(null); }
    else if (id !== 'text' && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();onChangeEmojis(items.filter(item => item.id !== id));onSelect(null);
    }
  }
  const gestures = (id: string, x: number, y: number) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => pointerDown(event, id, x, y),
    onPointerMove: pointerMove, onPointerUp: pointerEnd, onPointerCancel: pointerEnd,
    onLostPointerCapture: () => { drag.current = null; },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => keyDown(event, id, x, y),
    onClick: (event: MouseEvent<HTMLButtonElement>) => { event.stopPropagation();onSelect(id); },
    onFocus: () => onSelect(id),
  });
  return <div className={styles.stageLayer} ref={layer}>
    <canvas ref={canvas} className={styles.stageCanvas} width={512} height={512} aria-hidden="true"/>
    {interactive ? <>
      <span id={helpId} className="sr-only">{t('Utilise les flèches pour déplacer. Maj accélère. Suppr retire l’émoji.')}</span>
      {textBounds ? <button type="button" className={styles.overlayHit} disabled={disabled} aria-label={t('Déplacer le texte')} aria-describedby={helpId} aria-pressed={selectedId === 'text'} style={{left: `${textBounds.x / 512 * 100}%`, top: `${textBounds.y / 512 * 100}%`, width: `${textBounds.width / 512 * 100}%`, height: `${textBounds.height / 512 * 100}%`}} {...gestures('text', textBounds.x, textBounds.y)}/> : null}
      {items.map((item, index) => <button type="button" className={styles.overlayHit} key={item.id} disabled={disabled} aria-label={t('Déplacer l’émoji {number}', {number: index + 1})} aria-describedby={helpId} aria-pressed={selectedId === item.id} style={{left: `${item.x / 512 * 100}%`, top: `${item.y / 512 * 100}%`, width: `${item.size / 512 * 100}%`, height: `${item.size / 512 * 100}%`}} {...gestures(item.id, item.x, item.y)}/>)}
    </> : null}
  </div>;
}
