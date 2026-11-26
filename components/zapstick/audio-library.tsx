'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {BookmarkPlus, Check, Link as LinkIcon, LoaderCircle, Mic, Music2, Pencil, Play, Plus, Square, Trash2, Upload, X} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {decodeAudio, registerAudioWork, type AudioTrack} from '@/lib/stickers/audio';
import {AUDIO_LIBRARY_CHANGED, loadAudioLibrary, removeSavedAudio, renameSavedAudio, saveAudioToLibrary, type SavedAudio} from '@/lib/stickers/audio-library';
import {importAudioUrl} from '@/lib/stickers/audio-url';
import {createMicrophoneSession,type MicrophoneState} from '@/lib/stickers/microphone';
import {useConfirmAction} from './confirm-action';
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
  return <button type="button" className="audio-library-save" data-action="save" disabled={disabled || saving || saved === track.blob} onClick={() => void save()}>{saving ? <LoaderCircle size={17} className="spin"/> : saved === track.blob ? <Check size={17}/> : <BookmarkPlus size={17}/>}<span>{t(saved === track.blob ? 'Son enregistré' : 'Garder dans Mes sons')}</span></button>;
}

type Props = {onChoose?: (audio: SavedAudio) => void; onListen?: () => void; disabled?: boolean};
export function AudioLibrary({onChoose, onListen, disabled = false}: Props) {
  const {t, locale} = usePreferences(),confirm=useConfirmAction();
  const [entries, setEntries] = useState<SavedAudio[] | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null), [name, setName] = useState(''), [playing, setPlaying] = useState<string | null>(null);
  const [linkOpen,setLinkOpen]=useState(false),[link,setLink]=useState(''),[microphone,setMicrophone]=useState<MicrophoneState>('idle'),[elapsed,setElapsed]=useState(0);
  const file = useRef<HTMLInputElement>(null), audio = useRef<HTMLAudioElement>(null), audioUrl = useRef(''), playingId = useRef<string | null>(null), alive = useRef(true), operation = useRef<AbortController | null>(null);
  const mic=useRef<ReturnType<typeof createMicrophoneSession>|null>(null);
  const locked = disabled || busy;
  const stop = useCallback(() => {
    audio.current?.pause(); playingId.current = null;
    if (audioUrl.current) { URL.revokeObjectURL(audioUrl.current); audioUrl.current = ''; }
    if (alive.current) setPlaying(null);
  }, []);
  const cancel=useCallback(()=>{
    operation.current?.abort();operation.current=null;mic.current?.cancel();mic.current=null;
    if(alive.current){setBusy(false);setMicrophone('idle');}
  },[]);
  useEffect(() => {
    alive.current = true;
    const refresh = () => { void loadAudioLibrary().then(value => { if (alive.current) setEntries(value); }).catch(reason => { if (alive.current) setError(message(reason)); }); };
    refresh(); window.addEventListener(AUDIO_LIBRARY_CHANGED, refresh); window.addEventListener('focus', refresh);
    const player = audio.current;
    const unregister = registerAudioWork(() => { cancel(); stop(); });
    return () => { alive.current = false; cancel(); player?.pause(); stop(); unregister(); window.removeEventListener(AUDIO_LIBRARY_CHANGED, refresh); window.removeEventListener('focus', refresh); };
  }, [stop,cancel]);
  useEffect(() => { if (disabled) { cancel(); stop(); } }, [disabled, stop,cancel]);
  async function preview(entry: SavedAudio) {
    if (locked) return;
    if (playingId.current === entry.id) { stop(); return; }
    stop(); onListen?.(); const player = audio.current; if (!player) return;
    audioUrl.current = URL.createObjectURL(entry.blob); player.src = audioUrl.current; playingId.current = entry.id; setPlaying(entry.id); setError('');
    try { await player.play(); }
    catch { if (playingId.current === entry.id) { stop(); setError('Ce son ne peut pas être lu dans ce navigateur.'); } }
  }
  async function importTrack(resolve:(signal:AbortSignal)=>Promise<AudioTrack>) {
    if (locked || operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError(''); stop(); onListen?.();
    try {
      const track = await resolve(controller.signal);
      const saved = await saveAudioToLibrary(track, track.name, controller.signal);
      const entries=await loadAudioLibrary();
      if (!controller.signal.aborted && alive.current) { setEntries(entries); setLinkOpen(false);setLink('');onChoose?.(saved); }
    } catch (reason) { if (!controller.signal.aborted && alive.current && !(reason instanceof DOMException && reason.name==='AbortError')) setError(message(reason)); }
    finally { if (operation.current === controller) { operation.current = null;mic.current=null;if (alive.current){setBusy(false);setMicrophone('idle');} } }
  }
  function importFile(source:File){return importTrack(signal=>decodeAudio(source,{name:source.name.replace(/\.[^.]+$/,''),source:'file',signal}));}
  function importLink(){
    return importTrack(async signal=>{const source=await importAudioUrl(link,signal);return decodeAudio(source.blob,{name:source.name,source:'url',signal});});
  }
  function record(){
    setLinkOpen(false);setElapsed(0);
    return importTrack(async signal=>{
      const session=createMicrophoneSession({onState:value=>{if(alive.current)setMicrophone(value);},onElapsed:value=>{if(alive.current)setElapsed(value);}});mic.current=session;
      const blob=await session.record(signal);
      return decodeAudio(blob,{name:t('Micro'),source:'microphone',signal});
    });
  }
  async function rename(entry: SavedAudio) {
    if (locked || !name.trim()) return;
    setBusy(true); setError('');
    try { await renameSavedAudio(entry.id, name); if (alive.current) { setEntries(await loadAudioLibrary()); setEditing(null); } }
    catch (reason) { if (alive.current) setError(message(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function remove(entry: SavedAudio) {
    if (locked || !await confirm({description:t('Supprimer « {name} » ?',{name:entry.name})})) return;
    setBusy(true); setError(''); if (playingId.current === entry.id) stop();
    try { await removeSavedAudio(entry.id); if (alive.current) { setEntries(await loadAudioLibrary()); if (editing === entry.id) setEditing(null); } }
    catch (reason) { if (alive.current) setError(message(reason)); }
    finally { if (alive.current) setBusy(false); }
  }
  const seconds = (value: number) => new Intl.NumberFormat(locale, {maximumFractionDigits: 1}).format(value);
  return <div className="audio-library" aria-busy={busy}>
    <div className="audio-library-heading"><span>{entries ? t('Sons enregistrés : {count}', {count: entries.length}) : t('Chargement du son…')}</span>{onChoose?<button type="button" data-action="save" disabled={locked} onClick={()=>file.current?.click()}><Upload size={17}/>{t('Importer')}</button>:null}</div>
    {!onChoose?<div className="audio-library-sources" role="group" aria-label={t('Ajouter un son')}>
      <button type="button" data-action="save" disabled={locked} onClick={()=>file.current?.click()}><Upload size={18}/>{t('Fichier')}</button>
      <button type="button" data-action="edit" disabled={locked} aria-expanded={linkOpen} onClick={()=>setLinkOpen(value=>!value)}><LinkIcon size={18}/>{t('Lien')}</button>
      <button type="button" data-action="organize" disabled={locked} onClick={()=>void record()}><Mic size={18}/>{t('Micro')}</button>
    </div>:null}
    {!onChoose&&linkOpen?<form className="audio-library-link" onSubmit={event=>{event.preventDefault();if(link.trim())void importLink();}}><input type="url" aria-label={t('Lien audio')} placeholder={t('Lien audio ou MyInstants')} maxLength={2048} required autoComplete="off" value={link} disabled={locked} onChange={event=>setLink(event.target.value)}/><button type="submit" data-action="save" disabled={locked||!link.trim()}>{t('Importer')}</button></form>:null}
    <input ref={file} hidden type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.opus,.aac,.webm" onChange={event => { const next = event.target.files?.[0]; event.target.value = ''; if (next) void importFile(next); }}/>
    <audio ref={audio} hidden preload="metadata" onEnded={stop}/>
    {error ? <p className="audio-library-error" role="alert">{t(error)}</p> : null}
    {busy ? <div className="audio-library-status"><span role="status">{microphone==='waiting'?t('En attente du microphone…'):microphone==='recording'?<><Mic size={17}/>{t('Enregistrement…')} {seconds(elapsed)} / 6 s</>:<><LoaderCircle size={17} className="spin"/>{t('Chargement du son…')}</>}</span>{microphone==='recording'?<button type="button" data-action="save" onClick={()=>mic.current?.stop()}><Square size={16}/>{t('Enregistrer')}</button>:null}<button type="button" className="quiet-button" onClick={cancel}>{t('Annuler')}</button></div> : null}
    {entries?.length === 0 ? <div className="audio-library-empty"><Music2 size={27}/><p>{t('Aucun son enregistré')}</p></div> : null}
    <div className="audio-library-list">{entries?.map(entry => <div className="audio-library-row" key={entry.id}>
      <button type="button" className="audio-library-preview" disabled={locked} aria-label={t(playing === entry.id ? 'Arrêter {name}' : 'Écouter {name}', {name: entry.name})} aria-pressed={playing === entry.id} onClick={() => void preview(entry)}>{playing === entry.id ? <Square size={17}/> : <Play size={18}/>}</button>
      {editing === entry.id ? <form className="audio-library-rename" onSubmit={event => { event.preventDefault(); void rename(entry); }}><input aria-label={t('Nom du son')} autoFocus maxLength={120} value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(null); }} disabled={locked}/><button type="submit" data-action="save" aria-label={t('Enregistrer')} disabled={locked || !name.trim()}><Check size={18}/></button><button type="button" aria-label={t('Annuler')} onClick={() => setEditing(null)} disabled={locked}><X size={18}/></button></form> : <>
        {onChoose ? <button type="button" className="audio-library-use" disabled={locked} aria-label={t('Utiliser {name}', {name: entry.name})} onClick={() => { stop(); onChoose(entry); }}><span><strong>{entry.name}</strong><small>{seconds(entry.duration)} s</small></span><Plus size={18}/></button> : <div className="audio-library-name"><strong>{entry.name}</strong><small>{seconds(entry.duration)} s</small></div>}
        <button type="button" className="audio-library-edit action-icon" data-action="edit" disabled={locked} aria-label={t('Renommer {name}', {name: entry.name})} onClick={() => { setName(entry.name); setEditing(entry.id); }}><Pencil size={17}/></button>
        <button type="button" className="audio-library-remove action-icon" data-action="delete" disabled={locked} aria-label={t('Supprimer {name}', {name: entry.name})} onClick={() => void remove(entry)}><Trash2 size={17}/></button>
      </>}
    </div>)}</div>
  </div>;
}
