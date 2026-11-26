'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {BookmarkPlus, Check, LoaderCircle, Music2, Pencil, Play, Plus, Square, Trash2, Upload, X} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {decodeAudio, registerAudioWork, type AudioTrack} from '@/lib/stickers/audio';
import {AUDIO_LIBRARY_CHANGED, loadAudioLibrary, removeSavedAudio, renameSavedAudio, saveAudioToLibrary, type SavedAudio} from '@/lib/stickers/audio-library';
import './audio-library.css';

const message = (error: unknown) => error instanceof Error ? error.message : 'Impossible d’enregistrer ce son sur cet appareil.';

export function SaveAudioButton({track, disabled = false, onError}: {track: AudioTrack; disabled?: boolean; onError: (message: string) => void}) {
  const {t} = usePreferences(), operation = useRef<AbortController | null>(null);
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState<Blob | null>(null);
  useEffect(() => { setSaving(false); setSaved(null); return () => { operation.current?.abort(); operation.current = null; }; }, [track.blob]);
  async function save() {
    if (disabled || operation.current || saved === track.blob) return;
    const controller = new AbortController(); operation.current = controller; setSaving(true);
    try { await saveAudioToLibrary(track, track.name, controller.signal); if (!controller.signal.aborted) setSaved(track.blob); }
    catch (error) { if (!controller.signal.aborted) onError(message(error)); }
    finally { if (operation.current === controller) { operation.current = null; setSaving(false); } }
  }
  return <button type="button" className="audio-library-save" disabled={disabled || saving || saved === track.blob} onClick={() => void save()}>{saving ? <LoaderCircle size={17} className="spin"/> : saved === track.blob ? <Check size={17}/> : <BookmarkPlus size={17}/>}<span>{t(saved === track.blob ? 'Son enregistré' : 'Garder dans Mes sons')}</span></button>;
}

type Props = {onChoose?: (audio: SavedAudio) => void; onListen?: () => void; disabled?: boolean};
export function AudioLibrary({onChoose, onListen, disabled = false}: Props) {
  const {t, locale} = usePreferences();
  const [entries, setEntries] = useState<SavedAudio[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState(''), [playing, setPlaying] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null), audio = useRef<HTMLAudioElement>(null), audioUrl = useRef(''), playingId = useRef<string | null>(null), alive = useRef(true), operation = useRef<AbortController | null>(null);
  const locked = disabled || busy;
  const stop = useCallback(() => {
    audio.current?.pause(); playingId.current = null;
    if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = ''; }
    if (alive.current) setPlaying(null);
  }, []);
  useEffect(() => {
    alive.current = true;
    const refresh = () => { void loadAudioLibrary().then(value => { if (alive.current) setEntries(value); }).catch(reason => { if (alive.current) setError(message(reason)); }); };
    refresh(); window.addEventListener(AUDIO_LIBRARY_CHANGED, refresh); window.addEventListener('focus', refresh);
    const player = audio.current;
    const unregister = registerAudioWork(() => { operation.current?.abort(); operation.current = null; if (alive.current) setBusy(false); stop(); });
    return () => { alive.current = false; operation.current?.abort(); player?.pause(); stop(); unregister(); window.removeEventListener(AUDIO_LIBRARY_CHANGED, refresh); window.removeEventListener('focus', refresh); };
  }, [stop]);
  useEffect(() => { if (disabled) { operation.current?.abort(); operation.current = null; setBusy(false); stop(); } }, [disabled, stop]);
  async function preview(entry: SavedAudio) {
    if (locked) return;
    if (playingId.current === entry.id) { stop(); return; }
    stop(); onListen?.(); const player = audio.current; if (!player) return;
    audioUrl.current = URL.createObjectURL(entry.blob); player.src = audioUrl.current; playingId.current = entry.id; setPlaying(entry.id); setError('');
    try { await player.play(); }
    catch { if (playingId.current === entry.id) { stop(); setError('Ce son ne peut pas être lu dans ce navigateur.'); } }
  }
  async function importFile(source: File) {
    if (locked || operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(''); stop();
    try {
      const track = await decodeAudio(source, {name: source.name.replace(/\.[^.]+$/, ''), source: 'file', signal: controller.signal});
      const saved = await saveAudioToLibrary(track, track.name, controller.signal);
      if (!controller.signal.aborted && alive.current) { setEntries(await loadAudioLibrary()); onChoose?.(saved); }
    } catch (reason) { if (!controller.signal.aborted && alive.current) setError(message(reason)); }
    finally { if (operation.current === controller) { operation.current = null; if (alive.current) setBusy(false); } }
  }
  async function rename(entry: SavedAudio) {
    if (locked || !name.trim()) return;
    setBusy(true); setError('');
    try { await renameSavedAudio(entry.id, name); if (alive.current) { setEntries(await loadAudioLibrary()); setEditing(null); } }
    catch (reason) { if (alive.current) setError(message(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function remove(entry: SavedAudio) {
    if (locked) return;
    setBusy(true); setError(''); if (playingId.current === entry.id) stop();
    try { await removeSavedAudio(entry.id); if (alive.current) { setEntries(await loadAudioLibrary()); if (editing === entry.id) setEditing(null); } }
    catch (reason) { if (alive.current) setError(message(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  const seconds = (value: number) => new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(value);
  return <div className="audio-library" aria-busy={busy}>
    <div className="audio-library-heading"><span>{entries ? t('Sons enregistrés : {count}', {count: entries.length}) : t('Chargement du son…')}</span><button type="button" disabled={locked} onClick={() => file.current?.click()}><Upload size={17}/>{t('Importer')}</button></div>
    <input ref={file} hidden type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.webm" onChange={event => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void importFile(next); }}/>
    <audio ref={audio} hidden preload="metadata" onEnded={stop}/>
    {error ? <p className="audio-library-error" role="alert">{t(error)}</p> : null}
    {busy ? <p className="audio-library-status" role="status"><LoaderCircle size={17} className="spin"/>{t('Chargement du son…')}</p> : null}
    {entries?.length === 0 ? <div className="audio-library-empty"><Music2 size={27}/><p>{t('Aucun son enregistré')}</p></div> : null}
    <div className="audio-library-list">{entries?.map(entry => <div className="audio-library-row" key={entry.id}>
      <button type="button" className="audio-library-preview" disabled={locked} aria-label={t(playing === entry.id ? 'Arrêter {name}' : 'Écouter {name}', {name: entry.name})} aria-pressed={playing === entry.id} onClick={() => void preview(entry)}>{playing === entry.id ? <Square size={17}/> : <Play size={18}/>}</button>
      {editing === entry.id ? <form className="audio-library-rename" onSubmit={event => { event.preventDefault(); void rename(entry); }}><input aria-label={t('Nom du son')} autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(null); }} disabled={locked}/><button type="submit" aria-label={t('Enregistrer')} disabled={locked || !name.trim()}><Check size={18}/></button><button type="button" aria-label={t('Annuler')} onClick={() => setEditing(null)} disabled={locked}><X size={18}/></button></form> : <>
        {onChoose ? <button type="button" className="audio-library-use" disabled={locked} aria-label={t('Utiliser {name}', {name: entry.name})} onClick={() => { stop(); onChoose(entry); }}><span><strong>{entry.name}</strong><small>{seconds(entry.duration)} s</small></span><Plus size={18}/></button> : <div className="audio-library-name"><strong>{entry.name}</strong><small>{seconds(entry.duration)} s</small></div>}
        <button type="button" className="audio-library-edit" disabled={locked} aria-label={t('Renommer {name}', {name: entry.name})} onClick={() => { setName(entry.name); setEditing(entry.id); }}><Pencil size={17}/></button>
        <button type="button" className="audio-library-remove" disabled={locked} aria-label={t('Supprimer {name}', {name: entry.name})} onClick={() => void remove(entry)}><Trash2 size={17}/></button>
      </>}
    </div>)}</div>
  </div>;
}
