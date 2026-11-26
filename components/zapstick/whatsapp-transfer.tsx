'use client';

import {useEffect, useRef, useState} from 'react';
import {Check, LoaderCircle, MessageCircle} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import type {Sticker} from '@/lib/stickers/types';
import {isWhatsAppTransferTerminal, whatsAppTransferClient as client, WhatsAppTransferError, type WhatsAppAvailability, type WhatsAppTransfer} from '@/lib/stickers/whatsapp-transfer';
import styles from './whatsapp-transfer.module.css';

type Props = {sticker: Sticker; disabled?: boolean; active?: boolean; beforePrepare?: () => Promise<void>};
type ViewState = {visual?: Blob; sound?: Blob; transfer: WhatsAppTransfer | null; phase: 'idle' | 'preparing' | 'cancelling'; error: string};
function errorSource(error: unknown, cancelling = false) {
  if (error instanceof WhatsAppTransferError) {
    if (error.code === 'storage') return 'Impossible d’enregistrer le transfert sur cet appareil.';
    if (error.status === 413 || error.code === 'too_large') return 'Le sticker dépasse la taille autorisée.';
    if (error.status === 429 || error.code === 'busy') return 'Trop de demandes. Réessaie dans un instant.';
    if (error.code === 'sound_unavailable') return 'Les stickers sonores ne sont pas encore disponibles ici.';
    if (error.code === 'invalid' || error.status === 422 || error.status === 415) return 'Ce fichier ne peut pas être envoyé.';
    if (cancelling && error.status === 409) return 'Annulation impossible : l’envoi a déjà commencé.';
    if (error.code === 'unavailable' || error.status === 503) return 'WhatsApp momentanément indisponible.';
  }
  return 'Transfert interrompu.';
}
function stateSource(transfer: WhatsAppTransfer | null) {
  switch (transfer?.state) {
    case 'awaiting_message': return 'En attente de ton message WhatsApp.';
    case 'queued': case 'processing': case 'sending': return 'Envoi en cours…';
    case 'accepted': return 'Remis à WhatsApp.';
    case 'delivered': return 'Sticker livré.';
    case 'delivery_unknown': return 'Envoi à vérifier dans WhatsApp.';
    case 'failed': return 'Envoi impossible. Réessaie.';
    case 'cancelled': return 'Transfert annulé.';
    case 'expired': return 'Code expiré.';
    default: return '';
  }
}

/** No media is uploaded on mount. The action is offered only for a finished sticker. */
export function WhatsAppTransfer(props: Props) {
  if (!props.sticker.isSticker || props.sticker.mime !== 'image/webp' || !props.sticker.blob) return null;
  return <StickerWhatsAppTransfer {...props}/>;
}
function StickerWhatsAppTransfer({sticker, disabled = false, active = true, beforePrepare}: Props) {
  const {locale, t} = usePreferences();
  const visual = sticker.blob, sound = sticker.sound?.blob;
  const [availability, setAvailability] = useState<WhatsAppAvailability | null>(null);
  const [view, setView] = useState<ViewState>({visual, sound, transfer: null, phase: 'idle', error: ''});
  const operation = useRef<AbortController | null>(null), revision = useRef(0);
  const matches = view.visual === visual && view.sound === sound;
  const transfer = matches ? view.transfer : null, phase = matches ? view.phase : 'idle', error = matches ? view.error : '';
  const busy = phase !== 'idle';

  useEffect(() => {
    const controller = new AbortController(), version = ++revision.current;
    operation.current?.abort(); operation.current = null;
    setView({visual, sound, transfer: null, phase: 'idle', error: ''});
    if (active) client.status(controller.signal).then(async value => {
      if (controller.signal.aborted || revision.current !== version) return;
      setAvailability(value);
      if (!value.enabled) return;
      try {
        const restored = await client.resume(sticker, controller.signal);
        if (!controller.signal.aborted && revision.current === version) setView({visual, sound, transfer: restored, phase: 'idle', error: ''});
      } catch { /* Recovery can be retried explicitly without uploading anything. */ }
    }).catch(() => { if (!controller.signal.aborted && revision.current === version) setAvailability(null); });
    return () => { controller.abort(); operation.current?.abort(); operation.current = null; revision.current++; };
  }, [visual, sound, active]);

  useEffect(() => {
    if (!active || !transfer || isWhatsAppTransferTerminal(transfer.state) || busy) return;
    const controller = new AbortController(), id = transfer.id, version = revision.current;
    let timeout: ReturnType<typeof setTimeout> | undefined, tries = 0;
    const schedule = () => {
      if (controller.signal.aborted || document.visibilityState === 'hidden') return;
      timeout = setTimeout(check, Math.min(10_000, 1500 * 1.5 ** Math.min(tries++, 8)));
    };
    const check = async () => {
      if (controller.signal.aborted || document.visibilityState === 'hidden') return;
      try {
        const next = await client.get(id, controller.signal);
        if (controller.signal.aborted || revision.current !== version) return;
        setView(previous => previous.visual === visual && previous.sound === sound ? {...previous, transfer: next, error: ''} : previous);
        if (isWhatsAppTransferTerminal(next.state)) return;
      } catch {
        if (controller.signal.aborted || revision.current !== version) return;
        setView(previous => previous.visual === visual && previous.sound === sound ? {...previous, error: 'Impossible de vérifier l’envoi. Réessaie.'} : previous);
        if (Date.now() >= transfer.expiresAt) return;
      }
      schedule();
    };
    const visibility = () => { if (timeout) clearTimeout(timeout); if (document.visibilityState !== 'hidden') void check(); };
    document.addEventListener('visibilitychange', visibility); schedule();
    return () => { controller.abort(); if (timeout) clearTimeout(timeout); document.removeEventListener('visibilitychange', visibility); };
  }, [active, transfer?.id, transfer?.state, transfer?.expiresAt, busy, visual, sound]);

  useEffect(() => {
    if (!transfer || isWhatsAppTransferTerminal(transfer.state)) return;
    const timer = setTimeout(() => setView(previous => {
      if (previous.visual !== visual || previous.sound !== sound || !previous.transfer || isWhatsAppTransferTerminal(previous.transfer.state)) return previous;
      // An unclaimed code expires. A claimed send without a receipt stays uncertain.
      return {...previous, error: '', transfer: {...previous.transfer, state: previous.transfer.state === 'awaiting_message' ? 'expired' : 'delivery_unknown', claimCode: undefined, waUrl: undefined}};
    }), Math.max(0, transfer.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [transfer?.id, transfer?.state, transfer?.expiresAt, visual, sound]);

  async function checkStatus() {
    if (!transfer || operation.current) return;
    const controller = new AbortController(), version = revision.current;
    operation.current = controller;
    try {
      const next = await client.get(transfer.id, controller.signal);
      if (!controller.signal.aborted && revision.current === version) setView({visual, sound, transfer: next, phase: 'idle', error: ''});
    } catch (failure) {
      if (!controller.signal.aborted && revision.current === version) setView(previous => ({...previous, error: errorSource(failure)}));
    } finally { if (operation.current === controller) operation.current = null; }
  }

  async function prepare() {
    if (disabled || operation.current) return;
    const controller = new AbortController(), version = revision.current;
    operation.current = controller;
    // Snapshot references now: a later edit must never inherit this claim link.
    const snapshot = {...sticker, blob: visual, ...(sticker.sound ? {sound: {...sticker.sound, blob: sound!}} : {})};
    setView({visual, sound, transfer, phase: 'preparing', error: ''});
    try {
      const value = await client.status(controller.signal);
      if (!value.enabled || !value.ready) throw new WhatsAppTransferError('unavailable', 503);
      if (sound && !value.soundEnabled) throw new WhatsAppTransferError('sound_unavailable');
      const next = await client.prepare(snapshot, locale, {signal: controller.signal, beforePrepare, fresh: !!transfer && ['accepted', 'delivered', 'failed', 'cancelled', 'expired'].includes(transfer.state)});
      if (!controller.signal.aborted && revision.current === version) setView({visual, sound, transfer: next, phase: 'idle', error: ''});
    } catch (failure) {
      if (!controller.signal.aborted && revision.current === version) setView({visual, sound, transfer, phase: 'idle', error: errorSource(failure)});
    } finally { if (operation.current === controller) operation.current = null; }
  }
  async function cancel() {
    if (phase === 'cancelling') return;
    operation.current?.abort();
    const controller = new AbortController(), version = revision.current;
    operation.current = controller;
    setView({visual, sound, transfer, phase: 'cancelling', error: ''});
    try {
      const next = transfer ? await client.cancel(transfer.id, controller.signal) : await client.cancelFor(sticker, controller.signal);
      if (!controller.signal.aborted && revision.current === version) setView({visual, sound, transfer: next, phase: 'idle', error: next ? '' : 'Transfert interrompu.'});
    } catch (failure) {
      if (!controller.signal.aborted && revision.current === version) setView({visual, sound, transfer, phase: 'idle', error: errorSource(failure, true)});
    } finally { if (operation.current === controller) operation.current = null; }
  }

  if (!availability?.enabled) return null;
  const soundUnavailable = !!sound && !availability.soundEnabled;
  const readyLink = !busy && transfer?.state === 'awaiting_message' && Date.now() < transfer.expiresAt ? transfer.waUrl : undefined;
  const canPrepare = !transfer || ['accepted', 'delivered', 'failed', 'cancelled', 'expired'].includes(transfer.state);
  const cancellable = phase === 'preparing' || transfer && ['awaiting_message', 'queued', 'processing'].includes(transfer.state);
  const buttonText = phase === 'preparing' ? t('Préparation…') : phase === 'cancelling' ? t('Annulation…') : transfer && ['accepted', 'delivered'].includes(transfer.state) ? t('Recevoir à nouveau') : transfer && ['expired', 'cancelled', 'failed'].includes(transfer.state) ? t('Préparer à nouveau') : error ? t('Réessayer') : t('Recevoir sur WhatsApp');
  const status = soundUnavailable ? t('Les stickers sonores ne sont pas encore disponibles ici.') : error ? t(error) : readyLink ? t('Dans WhatsApp, touche Envoyer.') : transfer ? t(stateSource(transfer)) : t('Transfert temporaire de ce sticker.');
  return <div className={styles.root} aria-busy={busy}>
    {readyLink ? <a className={styles.action} href={readyLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={event => {
      if (disabled || Date.now() >= transfer!.expiresAt) { event.preventDefault(); return; }
      client.rememberReturn(sticker.id);
      for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) media.pause();
    }} aria-disabled={disabled || undefined}><MessageCircle size={20} aria-hidden="true"/>{t('Ouvrir WhatsApp')}</a> : canPrepare || busy ? <button type="button" className={styles.action} disabled={disabled || busy || soundUnavailable} onClick={prepare}>{busy ? <LoaderCircle className="spin" size={20} aria-hidden="true"/> : <MessageCircle size={20} aria-hidden="true"/>}{buttonText}</button> : <div className={styles.progress}>{transfer?.state === 'accepted' || transfer?.state === 'delivered' ? <Check size={18} aria-hidden="true"/> : !isWhatsAppTransferTerminal(transfer!.state) ? <LoaderCircle className="spin" size={18} aria-hidden="true"/> : null}</div>}
    <div className={styles.feedback}><p role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>{status}</p>{cancellable && phase !== 'cancelling' ? <button type="button" onClick={cancel} className={styles.cancel}>{t('Annuler')}</button> : null}{transfer && !busy && !canPrepare && (error || transfer.state === 'delivery_unknown') ? <button type="button" onClick={checkStatus} className={styles.cancel}>{t('Réessayer')}</button> : null}</div>
  </div>;
}
