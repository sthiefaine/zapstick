'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {Check, Share2} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {shareZapstick, zapstickShareUrl, type ShareResult} from '@/lib/stickers/share';
import styles from './share-zapstick.module.css';

export function ShareZapstick({disabled = false}: {disabled?: boolean}) {
  const {locale, t} = usePreferences(), inputId = useId();
  const [busy, setBusy] = useState(false), [result, setResult] = useState<ShareResult | null>(null);
  const pending = useRef(false), alive = useRef(true), manualInput = useRef<HTMLInputElement>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (result?.status === 'manual') { manualInput.current?.focus(); manualInput.current?.select(); } }, [result]);
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
  return <div className={styles.share}>
    <button type="button" className={styles.button} disabled={disabled || busy} aria-busy={busy} onClick={share}><Share2 size={18} aria-hidden="true"/>{t('Partager Zapstick')}</button>
    {result?.status === 'copied' ? <p className={styles.feedback} role="status"><Check size={15} aria-hidden="true"/>{t('Lien copié. À toi de le partager !')}</p> : null}
    {result?.status === 'manual' ? <div className={styles.manual}>
      <label htmlFor={inputId}>{t('Copie ce lien manuellement.')}</label>
      <input id={inputId} ref={manualInput} type="url" readOnly value={result.url} onFocus={event => event.currentTarget.select()} onClick={event => event.currentTarget.select()}/>
    </div> : null}
  </div>;
}
