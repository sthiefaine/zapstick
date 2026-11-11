'use client';
import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { ClipboardPaste, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Check, Download, ImagePlus, LoaderCircle, Plus, Type, Palette, SlidersHorizontal, RotateCw, Play, Pause, Move, RefreshCw, X, FolderPlus, Smile } from 'lucide-react';
import { defaults, loadImage, type EditOptions } from '@/lib/stickers/convert';
import type { Sticker, Pack } from '@/lib/stickers/types';
import { resolveImport, downloadRemote, type RemoteMedia } from '@/lib/stickers/import';
import { download } from '@/lib/stickers/store';
import {readClipboardLink} from '@/lib/stickers/clipboard';
import { useMediaUrl } from './media';
import { usePreferences } from '@/components/preferences-provider';
import { AnimationTimeline, GifAnimationCanvas } from './animation-timeline';
import { normalizeTrim, type TrimSelection } from '@/lib/stickers/timeline';
import type { AnimationPreview } from '@/lib/stickers/animation-preview';
import {TextStyleControls} from './text-style-controls';
import {OverlayStage} from './overlay-stage';
import {BackgroundRemovalControl} from './background-removal-control';
import type {EmojiOverlay,TextStyle,OverlaySelection} from '@/lib/stickers/overlays';
const message = (e: unknown) => e instanceof Error ? e.message : 'Impossible de charger ce média.';
const accepted = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime';
type Props = {
    draft: Sticker | null;
    active: boolean;
    packs: Pack[];
    stickers: Sticker[];
    onDraft: (s: Sticker | null) => void;
    onSave: (s: Sticker) => void;
    onError: (s: string) => void;
    onCollection: () => void;
    onWorking: (value: boolean) => void;
};
type Tool = 'crop' | 'text' | 'emoji' | 'background' | 'animation' | 'organize' | null;
export function Studio({ draft, active, packs, stickers, onDraft, onSave, onError, onCollection, onWorking }: Props) {
    const { t,reduceMotion } = usePreferences();
    const [link, setLink] = useState(''), [remote, setRemote] = useState<RemoteMedia[]>([]), [remoteSource, setRemoteSource] = useState('');
    const [o, setOptions] = useState<EditOptions>({ ...defaults }), [tool, setTool] = useState<Tool>(null), [name, setName] = useState(''), [packId, setPackId] = useState('');
    const [loading, setLoading] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(-1), [duration, setDuration] = useState(0), [playing, setPlaying] = useState(!reduceMotion), [result, setResult] = useState<Sticker | null>(null), [dragging, setDragging] = useState(false), [staticFrame, setStaticFrame] = useState('');
    const [animationPreview, setAnimationPreview] = useState<AnimationPreview | null>(null), [timelineLoading, setTimelineLoading] = useState(false), [playhead, setPlayhead] = useState(0), [seekRequest, setSeekRequest] = useState({ time: 0, revision: 0 });
    const [overlaySelection,setOverlaySelection]=useState<OverlaySelection>(null),[backgroundBusy,setBackgroundBusy]=useState(false),[backgroundOriginal,setBackgroundOriginal]=useState<Blob|null>(null);
    const file = useRef<HTMLInputElement>(null), video = useRef<HTMLVideoElement>(null), alive = useRef(true), generation = useRef(0), importOperation=useRef(false), pointers = useRef(new Map<number, {
        x: number;
        y: number;
    }>()), wasActive = useRef(active);
    const src = useMediaUrl(draft?.blob, draft?.src), resultSrc = useMediaUrl(result?.blob, result?.src);
    const canAnimate = !!draft && (draft.mime === 'image/gif' || draft.mime.startsWith('video/'));
    const isAnimated = canAnimate && o.animated, kind = isAnimated ? 'animated' : 'static';
    const matchingPacks = packs.filter(p => p.kind === kind);
    useEffect(() => { if (active && !wasActive.current && result)
        reset(); wasActive.current = active; }, [active]);
    useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
    useEffect(() => { generation.current++;setOptions({ ...defaults, animated: draft?.kind === 'animated' }); setName(draft?.name ?? ''); setPackId(''); setTool(null); setResult(null); setError(''); setDuration(0); setPlaying(!reduceMotion); setOverlaySelection(null); setBackgroundOriginal(null); setPlayhead(0); setSeekRequest({ time: 0, revision: 0 }); pointers.current.clear(); }, [draft?.id]);
    useEffect(() => {
        const controller = new AbortController(); let preview: AnimationPreview | undefined;
        setAnimationPreview(null); setTimelineLoading(false);
        if (!canAnimate || !draft?.blob) return;
        setTimelineLoading(true);
        import('@/lib/stickers/animation-preview').then(({ createAnimationPreview }) => createAnimationPreview(draft.blob!, controller.signal)).then(value => {
            preview = value;
            if (controller.signal.aborted) { value.dispose(); return; }
            setAnimationPreview(value); setDuration(value.duration);
            setOptions(current => current.animated ? ({ ...current, ...normalizeTrim(value.duration, current.start, current.duration) }) : ({...current,start:Math.min(Math.max(0,current.start),Math.max(0,value.duration-.001))}));
        }).catch(reason => { if (!controller.signal.aborted) setError(message(reason)); }).finally(() => { if (!controller.signal.aborted) setTimelineLoading(false); });
        return () => { controller.abort(); preview?.dispose(); };
    }, [draft?.id, draft?.blob, canAnimate]);
    useEffect(()=>{if(reduceMotion)setPlaying(false);},[reduceMotion]);
    useEffect(() => { const v = video.current; if (!v)
        return; if (active && playing && isAnimated && !result)
        v.play().catch(() => { });
    else
        v.pause(); }, [active, playing, isAnimated, result, src]);
    useEffect(() => { let cancelled = false; setStaticFrame(''); if (draft?.mime === 'image/gif' && !animationPreview && (!o.animated||!playing) && src) {
        loadImage(src).then(image => { if (cancelled)
            return; const canvas = document.createElement('canvas'), ratio = Math.min(512 / image.naturalWidth, 512 / image.naturalHeight, 1); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio)); canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height); setStaticFrame(canvas.toDataURL('image/png')); }).catch(e => { if (!cancelled)
            setError(message(e)); });
    } return () => { cancelled = true; }; }, [draft?.mime, src, o.animated,playing,animationPreview]);
    function seekPreview(time: number) {
        const value = Math.max(0, Math.min(Math.max(0, duration - .001), time));
        setPlaying(false); setPlayhead(value); setSeekRequest(current => ({ time: value, revision: current.revision + 1 }));
        if (video.current) video.current.currentTime = value;
    }
    function changeSelection(selection: TrimSelection, time: number) { setOptions(current => ({ ...current, ...selection })); seekPreview(time); }
    function togglePlayback() {
        if (playing) {
            const time = video.current?.currentTime ?? playhead;
            setSeekRequest(current => ({ time, revision: current.revision + 1 })); setPlaying(false);
        } else {
            const time = playhead >= o.start && playhead < o.start + o.duration ? playhead : o.start;
            if (video.current) video.current.currentTime = time;
            setSeekRequest(current => ({ time, revision: current.revision + 1 })); setPlaying(true);
        }
    }
    function update<K extends keyof EditOptions>(key: K, value: EditOptions[K]) { setOptions(p => ({ ...p, [key]: value })); }
    function setSource(sticker: Sticker) { generation.current++; setLoading(''); setRemote([]); onDraft(sticker); }
    async function chooseFile(f?: File) {
        if (!f)
            return;
        setError('');
        if (f.size > 20 * 1024 * 1024) {
            setError(t("Choisis un fichier de moins de 20 Mo."));
            return;
        }
        if (!accepted.split(',').includes(f.type)) {
            setError(t("Formats acceptés : JPG, PNG, WebP, GIF et vidéo MP4 / WebM."));
            return;
        }
        setSource({ id: crypto.randomUUID(), name: f.name.replace(/\.[^.]+$/, '').slice(0, 120), packId: '', kind: f.type === 'image/gif' || f.type.startsWith('video/') ? 'animated' : 'static', mime: f.type, blob: f, favorite: false, createdAt: Date.now(), isSticker: false });
    }
    async function loadRemote(item: RemoteMedia, source: string, request: number) {
        setLoading(t("Téléchargement…"));
        const blob = await downloadRemote(item.url);
        if (request !== generation.current || !alive.current)
            return;
        setSource({ id: crypto.randomUUID(), name: item.name, packId: '', kind: blob.type.startsWith('video/') || blob.type === 'image/gif' ? 'animated' : 'static', mime: blob.type, blob, favorite: false, createdAt: Date.now(), isSticker: false, sourceUrl: source });
    }
    async function resolveLink(value:string) {
        const request=++generation.current;
        setError('');setRemote([]);setLoading(t('Recherche du média…'));
        try {
            // resolveImport validates the complete URL and supported host before
            // any request is made. Always use this argument, not the link state.
            const data=await resolveImport(value.trim());
            if(request!==generation.current||!alive.current)return;
            setRemoteSource(data.source);
            if(data.media.length===1)await loadRemote(data.media[0],data.source,request);
            else setRemote(data.media);
        } catch(e) {
            if(request===generation.current&&alive.current)setError(message(e));
        } finally {
            if(request===generation.current&&alive.current)setLoading('');
        }
    }
    async function importLink(value=link) {
        if(!value.trim()||importOperation.current||progress>=0)return;
        importOperation.current=true;
        try{await resolveLink(value);}finally{importOperation.current=false;}
    }
    async function pasteAndImport() {
        if(importOperation.current||progress>=0)return;
        importOperation.current=true;
        const request=generation.current;
        setError('');setLoading(t('Lecture du presse-papiers…'));
        try {
            const value=await readClipboardLink({
                secure:window.isSecureContext,
                readText:typeof navigator.clipboard?.readText==='function'?()=>navigator.clipboard.readText():undefined,
            });
            if(!alive.current||request!==generation.current)return;
            setLink(value);
            await resolveLink(value);
        }catch(e){
            if(alive.current&&request===generation.current){setError(message(e));document.getElementById('source-link')?.focus();}
        }finally{
            importOperation.current=false;
            if(alive.current&&request===generation.current)setLoading('');
        }
    }
    async function selectRemote(item: RemoteMedia) { const request = ++generation.current; setError(''); try {
        await loadRemote(item, remoteSource, request);
    }
    catch (e) {
        if (alive.current)
            setError(message(e));
    }
    finally {
        if (alive.current)
            setLoading('');
    } }
    function pointerDown(e: ReactPointerEvent<HTMLDivElement>) { if (!draft || result || progress >= 0 || backgroundBusy)
        return; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
    function pointerMove(e: ReactPointerEvent<HTMLDivElement>) { const points = pointers.current; if (!points.has(e.pointerId) || progress >= 0 || backgroundBusy)
        return; const before = Array.from(points.values()), old = points.get(e.pointerId)!; points.set(e.pointerId, { x: e.clientX, y: e.clientY }); const after = Array.from(points.values()); if (points.size === 1) {
        const ratio = 512 / e.currentTarget.clientWidth;
        setOptions(p => ({ ...p, offsetX: Math.max(-400, Math.min(400, (p.offsetX ?? 0) + (e.clientX - old.x) * ratio)), offsetY: Math.max(-400, Math.min(400, (p.offsetY ?? 0) + (e.clientY - old.y) * ratio)) }));
    }
    else if (points.size === 2) {
        const distance = (a: {
            x: number;
            y: number;
        }, b: {
            x: number;
            y: number;
        }) => Math.hypot(a.x - b.x, a.y - b.y);
        const previous = distance(before[0], before[1]), next = distance(after[0], after[1]);
        if (previous > 0)
            setOptions(p => ({ ...p, zoom: Math.max(.35, Math.min(3, p.zoom * next / previous)) }));
    } }
    function pointerEnd(e: ReactPointerEvent<HTMLDivElement>) { pointers.current.delete(e.pointerId); }
    async function save() {
        if (!draft?.blob || progress >= 0)
            return;
        setError('');
        setProgress(0);
        onWorking(true);
        try {
            if (packId && stickers.filter(s => s.packId === packId).length >= 30)
                throw new Error(t("Ce pack est plein. Choisis un autre pack."));
            const { convert } = await import('@/lib/stickers/convert');
            const converted = await convert(draft.blob, { ...o, animated: !!canAnimate && o.animated }, n => { if (alive.current)
                setProgress(n); });
            if (!alive.current)
                return;
            const sticker: Sticker = { id: crypto.randomUUID(), name: name.trim() || t("Mon sticker"), packId, kind: converted.animated ? 'animated' : 'static', mime: 'image/webp', blob: converted.blob, favorite: false, createdAt: Date.now(), isSticker: true, sourceUrl: draft.sourceUrl };
            onSave(sticker);
            setResult(sticker);
            setTool(null);
            setProgress(-1);
            video.current?.pause();
        }
        catch (e) {
            if (alive.current) {
                setError(message(e));
                setProgress(-1);
            }
        }
        finally {
            onWorking(false);
        }
    }
    function reset() { generation.current++; onDraft(null); setResult(null); setLoading(''); setRemote([]); setLink(''); setError(''); }
    const disabled = !!loading || progress >= 0 || backgroundBusy;
    const overlayControls={text:o.text,textStyle:o.textStyle,emojis:o.emojis,selectedId:overlaySelection,onSelect:setOverlaySelection,onChangeTextStyle:(value:TextStyle)=>update('textStyle',value),onChangeEmojis:(value:EmojiOverlay[])=>update('emojis',value),disabled};
    function backgroundWorking(value:boolean){setBackgroundBusy(value);onWorking(value);}
    function removedBackground(blob:Blob){if(!draft)return;if(!backgroundOriginal&&draft.blob)setBackgroundOriginal(draft.blob);onDraft({...draft,blob,mime:'image/png'});}
    return <section className={`studio screen ${draft ? 'has-media' : ''} ${result ? 'studio-complete' : ''}`} aria-label={t("Créer un sticker")} hidden={!active}>
  {draft || result ? <div className="screen-title studio-title"><div><h1>{result ? t("Enregistré") : t("Modifier")}</h1></div>{draft && !result ? <button className="round-button" title={t("Changer de média")} aria-label={t("Changer de média")} disabled={disabled} onClick={() => file.current?.click()}><RefreshCw size={19}/></button> : null}</div> : <h1 className="sr-only">{t("Créer un sticker")}</h1>}
  <input ref={file} hidden type="file" accept={accepted} onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }}/>
  {!draft ? <form className="link-entry" aria-busy={!!loading} onSubmit={e => { e.preventDefault(); importLink(); }}><label className="sr-only" htmlFor="source-link">{t("Lien X ou lien direct vers un média")}</label><input id="source-link" type="url" placeholder={t("Colle ton lien ici")} value={link} onChange={e => setLink(e.target.value)} required disabled={!!loading}/><button className="clipboard-import" type="button" disabled={disabled} onClick={pasteAndImport} aria-label={t('Coller et importer')}><ClipboardPaste size={18} aria-hidden="true"/><span>{t('Coller et importer')}</span></button><button className="round-button dark" type="submit" disabled={!!loading || !link.trim()} aria-label={t("Récupérer le média")}>{loading ? <LoaderCircle size={18} className="spin"/> : <ArrowRight size={20}/>}</button></form> : null}
  {remote.length > 1 && !draft ? <div className="remote-choice" aria-label={t("Médias disponibles")}>{remote.map((m, i) => <button key={m.url} disabled={!!loading} onClick={() => selectRemote(m)} aria-label={t('Utiliser le média {count}', { count: i + 1 })}>{m.mime.startsWith('video/') ? <video src={m.url} crossOrigin="anonymous" muted playsInline preload="metadata"/> : <img src={m.url} crossOrigin="anonymous" referrerPolicy="no-referrer" alt={t('Média {count}', { count: i + 1 })}/>}<span>{i + 1}<ArrowRight size={14}/></span></button>)}</div> : null}
  <div className={`stage-shell ${!draft ? 'stage-empty' : ''} ${dragging ? 'stage-dragging' : ''} ${result ? 'stage-success' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled)
        chooseFile(e.dataTransfer.files[0]); }}>
   <div className={`stage ${draft ? 'checker' : ''} ${draft && !result ? 'stage-interactive' : ''}`} style={{ backgroundColor: result ? 'transparent' : o.background === 'transparent' ? undefined : o.background, backgroundImage: !result && o.background !== 'transparent' ? 'none' : undefined }} tabIndex={draft&&!result?0:undefined} role={draft&&!result?'group':undefined} aria-label={draft&&!result?t('Déplacer le sticker'):undefined} aria-describedby={draft&&!result?'sticker-keyboard-help':undefined} onKeyDown={e=>{if(!draft||result||progress>=0||backgroundBusy)return;const step=e.shiftKey?20:5;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')setOptions(p=>({...p,zoom:Math.min(3,p.zoom+.05)}));else if(e.key==='-')setOptions(p=>({...p,zoom:Math.max(.35,p.zoom-.05)}));else setOptions(p=>({...p,offsetX:Math.max(-400,Math.min(400,(p.offsetX??0)+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))),offsetY:Math.max(-400,Math.min(400,(p.offsetY??0)+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)) )}));}}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
    {result && resultSrc ? <img className="finished-sticker" src={resultSrc} alt={result.name}/> : draft && src ? <>
     {draft.mime.startsWith('video/') ? <video ref={video} className="stage-media" src={src} muted playsInline autoPlay={active && playing && isAnimated} preload="auto" style={{ left: `${50 + (o.offsetX ?? 0) / 512 * 100}%`, top: `${50 + (o.offsetY ?? 0) / 512 * 100}%`, transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.zoom})` }} onLoadedMetadata={e => { const d = e.currentTarget.duration; if (!Number.isFinite(d) || d <= 0) {
            setError(t("Cette vidéo ne peut pas être lue."));
            return;
        } setDuration(d); setOptions(p => p.animated ? ({ ...p, ...normalizeTrim(d, p.start, p.duration) }) : ({...p,start:Math.min(Math.max(0,p.start),Math.max(0,d-.001))})); }} onTimeUpdate={e => { if (playing && isAnimated && e.currentTarget.currentTime >= Math.min(duration, o.start + o.duration) && duration > 0)
            e.currentTarget.currentTime = o.start; setPlayhead(e.currentTarget.currentTime); }} onEnded={e => { if (playing && isAnimated) { e.currentTarget.currentTime = o.start; e.currentTarget.play().catch(() => {}); } }} onError={() => setError(t("Vidéo illisible dans ce navigateur."))}/> : draft.mime === 'image/gif' && animationPreview?.drawAt ? <GifAnimationCanvas preview={animationPreview} playing={playing && isAnimated} active={active && !result} start={o.start} length={o.duration} seek={seekRequest} onTimeUpdate={setPlayhead} onError={reason => setError(message(reason))} label={draft.name} style={{ left: `${50 + (o.offsetX ?? 0) / 512 * 100}%`, top: `${50 + (o.offsetY ?? 0) / 512 * 100}%`, transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.zoom})` }}/> : <img className="stage-media" src={staticFrame || src} alt={draft.name} draggable={false} style={{ left: `${50 + (o.offsetX ?? 0) / 512 * 100}%`, top: `${50 + (o.offsetY ?? 0) / 512 * 100}%`, transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.zoom})` }} onError={() => setError(t("Cette image ne peut pas être lue."))}/>}
     <OverlayStage {...overlayControls} onSelect={id=>{setOverlaySelection(id);if(id){setTool(id==='text'?'text':'emoji');setPlaying(false);}}}/>
    </> : <button className="stage-pick" onClick={() => file.current?.click()} disabled={disabled}><span className="blank-sticker" aria-hidden="true"><ImagePlus size={39} strokeWidth={1.4}/><span className="sticker-fold"/></span><strong>{t("Sélectionner un média")}</strong></button>}
    {loading || progress >= 0 ? <div className="stage-loading" role="status"><LoaderCircle className="spin" size={27}/><strong>{progress >= 0 ? t("Création du sticker…") : t(loading)}</strong>{progress >= 0 ? <><div className="progress-track"><span style={{ width: `${Math.max(4, progress)}%` }}/></div><small>{progress} %</small></> : null}</div> : null}
   </div>
   {draft && !result ? <><span className="stage-format">{isAnimated ? <><Play size={9} fill="currentColor"/>{t("ANIMÉ")}</> : t("FIXE")}</span>{canAnimate && isAnimated ? <button className="stage-play" aria-label={playing ? t("Mettre en pause") : t("Lire l’animation")} onClick={togglePlayback}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button> : null}</> : null}
   {result ? <span className="success-seal"><Check size={20}/></span> : null}
  </div>
  {error ? <div className="inline-error" role="alert">{t(error)}<button aria-label={t("Fermer le message")} onClick={() => setError('')}><X size={16}/></button></div> : null}
  {result ? <div className="completed-actions"><p>{result.kind === 'animated' ? t("Sticker animé") : t("Sticker fixe")} <span>·</span> {Math.round((result.blob?.size ?? 0) / 1024)} {t("Ko")}</p><button className="button primary" onClick={() => download(result.blob!, `${result.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'sticker'}.webp`)}><Download size={18}/>{t("Télécharger")}</button><div className="two-actions"><button className="button secondary" onClick={reset}><Plus size={17}/>{t("Un autre")}</button><button className="button secondary" onClick={onCollection}>{t("Ma collection")}<ArrowRight size={16}/></button></div></div> : draft ? <>
   <span id="sticker-keyboard-help" className="sr-only">{t("Utilise les flèches pour déplacer le sticker ; + et − pour zoomer.")}</span><p className="gesture-hint"><Move size={12}/>{t("Déplace au doigt · pince pour zoomer")}</p>{draft.kind === 'animated' && !canAnimate ? <p className="subtle-note">{t("Cette variante sera fixe. Utilise le GIF ou la vidéo d’origine pour garder l’animation.")}</p> : null}
   <div className="toolbelt" role="group" aria-label={t("Personnaliser le sticker")}>{([{ id: 'crop', label: t("Cadrer"), icon: SlidersHorizontal }, { id: 'text', label: t("Texte"), icon: Type }, { id: 'emoji', label: t("Émojis"), icon: Smile }, { id: 'background', label: t("Fond"), icon: Palette }, ...(canAnimate ? [{ id: 'animation', label: t("Animation"), icon: Play }] : [])] as const).map(item => <button key={item.id} className={tool === item.id ? 'selected' : ''} aria-pressed={tool === item.id} onClick={() => {setTool(tool === item.id ? null : item.id as Tool);if(item.id==='text'){setOverlaySelection('text');setPlaying(false);}if(item.id==='emoji'){if(overlaySelection==='text')setOverlaySelection(null);setPlaying(false);}}} disabled={disabled}><span><item.icon size={20}/></span>{item.label}</button>)}</div>
   {tool ? <div className="tool-panel">
    <div className="tool-panel-heading"><strong>{{ crop: t("Cadrage"), text: t("Texte"), emoji:t("Émojis"), background: t("Fond"), animation: t("Animation"), organize: t("Nom et pack") }[tool]}</strong><button className="small-icon" aria-label={t("Fermer les réglages")} onClick={() => setTool(null)}><X size={16}/></button></div>
    {tool === 'crop' ? <><div className="range-row"><span>{t("Zoom")}</span><input aria-label={t("Zoom")} type="range" min=".35" max="3" step=".01" value={o.zoom} onChange={e => update('zoom', Number(e.target.value))}/><span>{Math.round(o.zoom * 100)} %</span></div><div className="position-controls">{[{key:'left',label:'Vers la gauche',icon:ArrowLeft,x:-10,y:0},{key:'up',label:'Vers le haut',icon:ArrowUp,x:0,y:-10},{key:'down',label:'Vers le bas',icon:ArrowDown,x:0,y:10},{key:'right',label:'Vers la droite',icon:ArrowRight,x:10,y:0}].map(direction=><button className="button light" key={direction.key} aria-label={t(direction.label)} onClick={()=>setOptions(p=>({...p,offsetX:Math.max(-400,Math.min(400,(p.offsetX??0)+direction.x)),offsetY:Math.max(-400,Math.min(400,(p.offsetY??0)+direction.y))}))}><direction.icon size={17}/></button>)}</div><div className="two-actions"><button className="button light" onClick={() => update('rotation', (o.rotation + 90) % 360)}><RotateCw size={16}/>{t("Tourner")}</button><button className="button light" onClick={() => setOptions(p => ({ ...p, zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 }))}><RefreshCw size={16}/>{t("Recentrer")}</button></div></> : null}
    {tool==='text'||tool==='emoji'?<TextStyleControls {...overlayControls} mode={tool==='emoji'?'emoji':'text'} onChangeText={value=>update('text',value)}/>:null}
    {tool === 'background' ? <>{draft.kind==='static'&&draft.mime.startsWith('image/')&&draft.blob?<><BackgroundRemovalControl blob={draft.blob} disabled={progress>=0} onResult={removedBackground} onBusyChange={backgroundWorking}/>{backgroundOriginal?<button className="button light background-restore" disabled={backgroundBusy} onClick={()=>{onDraft({...draft,blob:backgroundOriginal,mime:backgroundOriginal.type});setBackgroundOriginal(null);}}>{t('Rétablir le fond')}</button>:null}</>:null}<div className="swatches">{['transparent', '#ffffff', '#bfe8b0', '#e7f0df', '#f6c1a3', '#25252b'].map(color => <button key={color} className={`${color === 'transparent' ? 'checker' : ''} ${o.background === color ? 'chosen' : ''}`} style={{ backgroundColor: color === 'transparent' ? undefined : color, color: color === '#25252b' ? '#fff' : '#222' }} aria-label={color === 'transparent' ? t("Fond transparent") : t('Fond {color}', { color })} aria-pressed={o.background === color} onClick={() => update('background', color)}>{o.background === color ? <Check size={18}/> : null}</button>)}</div></> : null}
    {tool === 'animation' ? <><div className="segmented"><button className={o.animated ? 'selected' : ''} aria-pressed={o.animated} onClick={() => { setOptions(current => ({ ...current, animated: true, ...(duration ? normalizeTrim(duration, current.start, current.duration) : {}) })); setPackId(''); }}>{t("Animé")}</button><button className={!o.animated ? 'selected' : ''} aria-pressed={!o.animated} onClick={() => { setOptions(current => ({ ...current, animated: false, start: playhead })); setPackId(''); seekPreview(playhead); }}>{t("Image fixe")}</button></div>{o.animated ? <AnimationTimeline duration={duration} selection={{ start: o.start, duration: o.duration }} thumbnails={animationPreview?.thumbnails ?? []} currentTime={playhead} playing={playing && isAnimated} disabled={progress >= 0} loading={timelineLoading} onChange={changeSelection} onSeek={seekPreview} onTogglePlay={togglePlayback}/> : null}</> : null}
    {tool === 'organize' ? <><input className="field" aria-label={t("Nom du sticker")} maxLength={120} value={name} placeholder={t("Nom du sticker")} onChange={e => setName(e.target.value)}/><select className="field" aria-label={t("Pack du nouveau sticker")} value={packId} onChange={e => setPackId(e.target.value)}><option value="">{t("Sans pack")}</option>{matchingPacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></> : null}
   </div> : null}
   <div className="studio-save"><button className="button primary" disabled={disabled || !draft.blob} onClick={save}>{progress >= 0 ? <><LoaderCircle className="spin" size={18}/>{progress} %</> : <><Check size={19}/>{t("Créer mon sticker")}<ArrowRight size={19}/></>}</button><button className="organize-shortcut" onClick={() => setTool(tool === 'organize' ? null : 'organize')} disabled={disabled}><FolderPlus size={14}/>{packId ? packs.find(p => p.id === packId)?.name : t("Nom et pack")}<span>·</span><span>{isAnimated ? t("Animé") : t("Fixe")}</span></button><button className="quiet-button" disabled={disabled} onClick={() => { if (draft.blob) {
            onSave({ ...draft, id: crypto.randomUUID(), name: name.trim() || draft.name, packId: '', createdAt: Date.now() });
            onError(t("Original ajouté à la collection."));
        } }}>{t("Garder seulement l’original")}</button></div>
  </> : null}
 </section>;
}
