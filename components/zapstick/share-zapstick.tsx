'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {Check, Share2} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {shareZapstick, zapstickShareUrl, type ShareResult} from '@/lib/stickers/share';
import styles from './share-zapstick.module.css';

export function ShareZapstick({disabled = false,compact=false}: {disabled?: boolean;compact?:boolean}) {
  const {locale, t} = usePreferences(), inputId = useId();
  const [busy, setBusy] = useState(false), [result, setResult] = useState<ShareResult | null>(null);
  const pending = useRef(false), alive = useRef(true), manualInput = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (result?.status === 'manual') { manualInput.current?.focus(); manualInput.current?.select(); } }, [result]);
  useEffect(()=>{if(compact&&result?.status==='copied'){const timer=setTimeout(()=>setResult(null),2500);return()=>clearTimeout(timer);}},[compact,result]);
  async function share() {
    if (disabled || pending.current) return;
    pending.current = true;setBusy(true);setResult(null);
    try {
      const url = zapstickShareUrl({locale, origin: window.location.origin, configuredUrl: process.env.NEXT_PUBLIC_SITE_URL});
      const value = await shareZapstick({title: 'Zapstick', text: t('Crée tes stickers WhatsApp avec Zapstick ✨'), url}, {
        share: typeof navigator.share === 'function' ? payload => navigator.share(payload) : undefined,
        writeText: typeof navigator.clipboard?.writeText === 'function' ? value => navigator.clipboard.writeText(value) : undefined,
      });
      if (alive.current) setResult(value);
    } finally { pending.current = false;if (alive.current) setBusy(false); }
  }
  return <div className={`${styles.share}${compact?` ${styles.compact}`:''}`}>
    <button type="button" className={compact?`round-button ${styles.iconButton}`:styles.button} disabled={disabled || busy} aria-busy={busy} aria-label={t('Partager Zapstick')} title={compact?t('Partager Zapstick'):undefined} onClick={share}>{compact&&result?.status==='copied'?<Check size={18} aria-hidden="true"/>:<Share2 size={18} aria-hidden="true"/>}{!compact?t('Partager Zapstick'):null}</button>
    {result?.status === 'copied' ? <p className={compact?'sr-only':styles.feedback} role="status">{!compact?<Check size={15} aria-hidden="true"/>:null}{t('Lien copié. À toi de le partager !')}</p> : null}
    {result?.status === 'manual' ? <div className={styles.manual}>
      <label htmlFor={inputId}>{t('Copie ce lien manuellement.')}</label>
      <input id={inputId} ref={manualInput} type="url" readOnly value={result.url} onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()}/>
    </div> : null}
  </div>;
}
