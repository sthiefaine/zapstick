'use client';
import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { ClipboardPaste, ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Check, Download, ImagePlus, Link2, LoaderCircle, Plus, Type, Palette, SlidersHorizontal, RotateCw, Play, Pause, Move, RefreshCw, X, FolderPlus } from 'lucide-react';
import { defaults, loadImage, type EditOptions } from '@/lib/stickers/convert';
import type { Sticker, Pack } from '@/lib/stickers/types';
import { resolveImport, downloadRemote, type RemoteMedia } from '@/lib/stickers/import';
import { download } from '@/lib/stickers/store';
import {readClipboardLink} from '@/lib/stickers/clipboard';
import { useMediaUrl } from './media';
import { usePreferences } from '@/components/preferences-provider';
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
type Tool = 'crop' | 'text' | 'background' | 'animation' | 'organize' | null;
export function Studio({ draft, active, packs, stickers, onDraft, onSave, onError, onCollection, onWorking }: Props) {
    const { t,reduceMotion } = usePreferences();
    const [sourceTab, setSourceTab] = useState<'file' | 'link'>('file'), [link, setLink] = useState(''), [remote, setRemote] = useState<RemoteMedia[]>([]), [remoteSource, setRemoteSource] = useState('');
    const [o, setOptions] = useState<EditOptions>({ ...defaults }), [tool, setTool] = useState<Tool>(null), [name, setName] = useState(''), [packId, setPackId] = useState('');
    const [loading, setLoading] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState(-1), [duration, setDuration] = useState(0), [playing, setPlaying] = useState(!reduceMotion), [result, setResult] = useState<Sticker | null>(null), [dragging, setDragging] = useState(false), [stageWidth, setStageWidth] = useState(320), [staticFrame, setStaticFrame] = useState('');
    const file = useRef<HTMLInputElement>(null), stage = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), alive = useRef(true), generation = useRef(0), importOperation=useRef(false), pointers = useRef(new Map<number, {
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
    useEffect(() => { generation.current++;setOptions({ ...defaults, animated: draft?.kind === 'animated' }); setName(draft?.name ?? ''); setPackId(''); setTool(null); setResult(null); setError(''); setDuration(0); setPlaying(!reduceMotion); pointers.current.clear(); }, [draft?.id]);
    useEffect(()=>{if(reduceMotion)setPlaying(false);},[reduceMotion]);
    useEffect(() => { const element = stage.current; if (!element)
        return; const observer = new ResizeObserver(entries => setStageWidth(entries[0].contentRect.width)); observer.observe(element); return () => observer.disconnect(); }, [draft?.id, result?.id]);
    useEffect(() => { const v = video.current; if (!v)
        return; if (active && playing && isAnimated && !result)
        v.play().catch(() => { });
    else
        v.pause(); }, [active, playing, isAnimated, result, src]);
    useEffect(() => { if (video.current && duration) {
        video.current.currentTime = Math.min(o.start, Math.max(0, duration - .01));
    } }, [o.start, duration, o.animated]);
    useEffect(() => { let cancelled = false; setStaticFrame(''); if (draft?.mime === 'image/gif' && (!o.animated||!playing) && src) {
        loadImage(src).then(image => { if (cancelled)
            return; const canvas = document.createElement('canvas'), ratio = Math.min(512 / image.naturalWidth, 512 / image.naturalHeight, 1); canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio)); canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height); setStaticFrame(canvas.toDataURL('image/png')); }).catch(e => { if (!cancelled)
            setError(message(e)); });
    } return () => { cancelled = true; }; }, [draft?.mime, src, o.animated,playing]);
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
    function pointerDown(e: ReactPointerEvent<HTMLDivElement>) { if (!draft || result || progress >= 0)
        return; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
    function pointerMove(e: ReactPointerEvent<HTMLDivElement>) { const points = pointers.current; if (!points.has(e.pointerId) || progress >= 0)
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
    function reset() { generation.current++; onDraft(null); setResult(null); setLoading(''); setRemote([]); setLink(''); setSourceTab('file'); setError(''); }
    const disabled = !!loading || progress >= 0;
    const linkOnly = !draft && !result && sourceTab === 'link';
    return <section className={`studio screen ${draft ? 'has-media' : ''} ${result ? 'studio-complete' : ''}`} aria-label={t("Créer un sticker")} hidden={!active}>
  <div className="screen-title studio-title"><div><h1>{result ? t("Enregistré") : draft ? t("Modifier") : t("Créer")}</h1></div>{draft && !result ? <button className="round-button" title={t("Changer de média")} aria-label={t("Changer de média")} disabled={disabled} onClick={() => file.current?.click()}><RefreshCw size={19}/></button> : null}</div>
  <input ref={file} hidden type="file" accept={accepted} onChange={e => { chooseFile(e.target.files?.[0]); e.target.value = ''; }}/>
  {!draft ? <div className="source-switch" role="group" aria-label={t("Source du média")}><button className={sourceTab === 'file' ? 'active' : ''} onClick={() => setSourceTab('file')}><ImagePlus size={16}/>{t("Photo / GIF")}</button><button className={sourceTab === 'link' ? 'active' : ''} onClick={() => setSourceTab('link')}><Link2 size={16}/>{t("Un lien")}</button></div> : null}
  {!draft && sourceTab === 'link' ? <form className="link-entry" aria-busy={!!loading} onSubmit={e => { e.preventDefault(); importLink(); }}><label className="sr-only" htmlFor="source-link">{t("Lien X ou lien direct vers un média")}</label><input id="source-link" type="url" autoFocus placeholder={t("Colle ton lien ici")} value={link} onChange={e => setLink(e.target.value)} required disabled={!!loading}/><button className="clipboard-import" type="button" disabled={!!loading||progress>=0} onClick={pasteAndImport} aria-label={t('Coller et importer')}><ClipboardPaste size={18} aria-hidden="true"/><span>{t('Coller et importer')}</span></button><button className="round-button dark" type="submit" disabled={!!loading || !link.trim()} aria-label={t("Récupérer le média")}>{loading ? <LoaderCircle size={18} className="spin"/> : <ArrowRight size={20}/>}</button></form> : null}
  {remote.length > 1 && !draft ? <div className="remote-choice" aria-label={t("Médias disponibles")}>{remote.map((m, i) => <button key={m.url} disabled={!!loading} onClick={() => selectRemote(m)} aria-label={t('Utiliser le média {count}', { count: i + 1 })}>{m.mime.startsWith('video/') ? <video src={m.url} crossOrigin="anonymous" muted playsInline preload="metadata"/> : <img src={m.url} crossOrigin="anonymous" referrerPolicy="no-referrer" alt={t('Média {count}', { count: i + 1 })}/>}<span>{i + 1}<ArrowRight size={14}/></span></button>)}</div> : null}
  {linkOnly && loading ? <p className="subtle-note" role="status">{t(loading)}</p> : null}
  <div hidden={linkOnly} className={`stage-shell ${!draft ? 'stage-empty' : ''} ${dragging ? 'stage-dragging' : ''} ${result ? 'stage-success' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled)
        chooseFile(e.dataTransfer.files[0]); }}>
   <div className={`stage checker ${draft && !result ? 'stage-interactive' : ''}`} ref={stage} style={{ backgroundColor: result ? 'transparent' : o.background === 'transparent' ? undefined : o.background, backgroundImage: !result && o.background !== 'transparent' ? 'none' : undefined }} tabIndex={draft&&!result?0:undefined} role={draft&&!result?'group':undefined} aria-label={draft&&!result?t('Déplacer le sticker'):undefined} aria-describedby={draft&&!result?'sticker-keyboard-help':undefined} onKeyDown={e=>{if(!draft||result||progress>=0)return;const step=e.shiftKey?20:5;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'].includes(e.key)){e.preventDefault();if(e.key==='+'||e.key==='=')setOptions(p=>({...p,zoom:Math.min(3,p.zoom+.05)}));else if(e.key==='-')setOptions(p=>({...p,zoom:Math.max(.35,p.zoom-.05)}));else setOptions(p=>({...p,offsetX:Math.max(-400,Math.min(400,(p.offsetX??0)+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0))),offsetY:Math.max(-400,Math.min(400,(p.offsetY??0)+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)) )}));}}} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
    {result && resultSrc ? <img className="finished-sticker" src={resultSrc} alt={result.name}/> : draft && src ? <>
     {draft.mime.startsWith('video/') ? <video ref={video} className="stage-media" src={src} muted playsInline autoPlay={active && playing && isAnimated} preload="auto" style={{ left: `${50 + (o.offsetX ?? 0) / 512 * 100}%`, top: `${50 + (o.offsetY ?? 0) / 512 * 100}%`, transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.zoom})` }} onLoadedMetadata={e => { const d = e.currentTarget.duration; if (!Number.isFinite(d) || d <= 0) {
            setError(t("Cette vidéo ne peut pas être lue."));
            return;
        } setDuration(d); setOptions(p => ({ ...p, duration: Math.min(p.duration, d) })); }} onTimeUpdate={e => { if (isAnimated && e.currentTarget.currentTime >= Math.min(duration, o.start + o.duration) && duration > 0)
            e.currentTarget.currentTime = o.start; }} onError={() => setError(t("Vidéo illisible dans ce navigateur."))}/> : <img className="stage-media" src={staticFrame || src} alt={draft.name} draggable={false} style={{ left: `${50 + (o.offsetX ?? 0) / 512 * 100}%`, top: `${50 + (o.offsetY ?? 0) / 512 * 100}%`, transform: `translate(-50%, -50%) rotate(${o.rotation}deg) scale(${o.zoom})` }} onError={() => setError(t("Cette image ne peut pas être lue."))}/>}
     {o.text ? <span className="stage-caption" style={{ fontSize: stageWidth * 44 / 512 }}>{o.text.slice(0, 45)}</span> : null}
    </> : <button className="stage-pick" onClick={() => sourceTab === 'file' ? file.current?.click() : document.getElementById('source-link')?.focus()} disabled={!!loading} aria-label={sourceTab === 'file' ? t("Choisir une image ou un GIF") : t("Saisir un lien")}><span className="blank-sticker"><ImagePlus size={39} strokeWidth={1.4}/><span className="sticker-fold"/></span><strong>{sourceTab === 'file' ? t("Sélectionne une image") : t("Un lien, un sticker")}</strong><span>{sourceTab === 'file' ? t("Photo, GIF, vidéo") : 'X · Giphy · Tenor'}</span></button>}
    {loading || progress >= 0 ? <div className="stage-loading" role="status"><LoaderCircle className="spin" size={27}/><strong>{progress >= 0 ? t("Création du sticker…") : t(loading)}</strong>{progress >= 0 ? <><div className="progress-track"><span style={{ width: `${Math.max(4, progress)}%` }}/></div><small>{progress} %</small></> : null}</div> : null}
   </div>
   {draft && !result ? <><span className="stage-format">{isAnimated ? <><Play size={9} fill="currentColor"/>{t("ANIMÉ")}</> : t("FIXE")}</span>{canAnimate && isAnimated ? <button className="stage-play" aria-label={playing ? t("Mettre en pause") : t("Lire l’animation")} onClick={() => setPlaying(p => !p)}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button> : null}</> : null}
   {result ? <span className="success-seal"><Check size={20}/></span> : null}
  </div>
  {error ? <div className="inline-error" role="alert">{t(error)}<button aria-label={t("Fermer le message")} onClick={() => setError('')}><X size={16}/></button></div> : null}
  {result ? <div className="completed-actions"><p>{result.kind === 'animated' ? t("Sticker animé") : t("Sticker fixe")} <span>·</span> {Math.round((result.blob?.size ?? 0) / 1024)} {t("Ko")}</p><button className="button primary" onClick={() => download(result.blob!, `${result.name.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'sticker'}.webp`)}><Download size={18}/>{t("Télécharger")}</button><div className="two-actions"><button className="button secondary" onClick={reset}><Plus size={17}/>{t("Un autre")}</button><button className="button secondary" onClick={onCollection}>{t("Ma collection")}<ArrowRight size={16}/></button></div></div> : draft ? <>
   <span id="sticker-keyboard-help" className="sr-only">{t("Utilise les flèches pour déplacer le sticker ; + et − pour zoomer.")}</span><p className="gesture-hint"><Move size={12}/>{t("Déplace au doigt · pince pour zoomer")}</p>{draft.kind === 'animated' && !canAnimate ? <p className="subtle-note">{t("Cette variante sera fixe. Utilise le GIF ou la vidéo d’origine pour garder l’animation.")}</p> : null}
   <div className="toolbelt" role="group" aria-label={t("Personnaliser le sticker")}>{([{ id: 'crop', label: t("Cadrer"), icon: SlidersHorizontal }, { id: 'text', label: t("Texte"), icon: Type }, { id: 'background', label: t("Fond"), icon: Palette }, ...(canAnimate ? [{ id: 'animation', label: t("Animation"), icon: Play }] : [])] as const).map(item => <button key={item.id} className={tool === item.id ? 'selected' : ''} aria-pressed={tool === item.id} onClick={() => setTool(tool === item.id ? null : item.id as Tool)} disabled={progress >= 0}><span><item.icon size={20}/></span>{item.label}</button>)}</div>
   {tool ? <div className="tool-panel">
    <div className="tool-panel-heading"><strong>{{ crop: t("Cadrage"), text: t("Texte"), background: t("Fond"), animation: t("Animation"), organize: t("Nom et pack") }[tool]}</strong><button className="small-icon" aria-label={t("Fermer les réglages")} onClick={() => setTool(null)}><X size={16}/></button></div>
    {tool === 'crop' ? <><div className="range-row"><span>{t("Zoom")}</span><input aria-label={t("Zoom")} type="range" min=".35" max="3" step=".01" value={o.zoom} onChange={e => update('zoom', Number(e.target.value))}/><span>{Math.round(o.zoom * 100)} %</span></div><div className="position-controls">{[{key:'left',label:'Vers la gauche',icon:ArrowLeft,x:-10,y:0},{key:'up',label:'Vers le haut',icon:ArrowUp,x:0,y:-10},{key:'down',label:'Vers le bas',icon:ArrowDown,x:0,y:10},{key:'right',label:'Vers la droite',icon:ArrowRight,x:10,y:0}].map(direction=><button className="button light" key={direction.key} aria-label={t(direction.label)} onClick={()=>setOptions(p=>({...p,offsetX:Math.max(-400,Math.min(400,(p.offsetX??0)+direction.x)),offsetY:Math.max(-400,Math.min(400,(p.offsetY??0)+direction.y))}))}><direction.icon size={17}/></button>)}</div><div className="two-actions"><button className="button light" onClick={() => update('rotation', (o.rotation + 90) % 360)}><RotateCw size={16}/>{t("Tourner")}</button><button className="button light" onClick={() => setOptions(p => ({ ...p, zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 }))}><RefreshCw size={16}/>{t("Recentrer")}</button></div></> : null}
    {tool === 'text' ? <input className="field" autoFocus aria-label={t("Texte du sticker")} placeholder={t("Écris ton texte")} value={o.text} maxLength={45} onChange={e => update('text', e.target.value)}/> : null}
    {tool === 'background' ? <div className="swatches">{['transparent', '#ffffff', '#d8f36a', '#ded6ff', '#ffcfbd', '#25252b'].map(color => <button key={color} className={`${color === 'transparent' ? 'checker' : ''} ${o.background === color ? 'chosen' : ''}`} style={{ backgroundColor: color === 'transparent' ? undefined : color, color: color === '#25252b' ? '#fff' : '#222' }} aria-label={color === 'transparent' ? t("Fond transparent") : t('Fond {color}', { color })} aria-pressed={o.background === color} onClick={() => update('background', color)}>{o.background === color ? <Check size={18}/> : null}</button>)}</div> : null}
    {tool === 'animation' ? <><div className="segmented"><button className={o.animated ? 'selected' : ''} onClick={() => { update('animated', true); setPackId(''); }}>{t("Animé")}</button><button className={!o.animated ? 'selected' : ''} onClick={() => { update('animated', false); setPackId(''); }}>{t("Image fixe")}</button></div>{o.animated ? <div className="timing-fields">{duration > 0 ? <label>{t("Début")}<input type="number" aria-label={t("Début en secondes")} min="0" max={Math.max(0, duration - .1)} step=".1" value={o.start} onChange={e => update('start', Math.max(0, Math.min(duration - .1, Number(e.target.value))))}/><span>{t("s")}</span></label> : null}<label>{t("Durée")}<input aria-label={t("Durée en secondes")} type="number" min=".3" max={duration ? Math.min(6, duration) : 6} step=".1" value={o.duration} onChange={e => update('duration', Math.max(.3, Math.min(duration ? Math.min(6, duration) : 6, Number(e.target.value))))}/><span>{t("s")}</span></label></div> : null}</> : null}
    {tool === 'organize' ? <><input className="field" aria-label={t("Nom du sticker")} maxLength={120} value={name} placeholder={t("Nom du sticker")} onChange={e => setName(e.target.value)}/><select className="field" aria-label={t("Pack du nouveau sticker")} value={packId} onChange={e => setPackId(e.target.value)}><option value="">{t("Sans pack")}</option>{matchingPacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></> : null}
   </div> : null}
   <div className="studio-save"><button className="button primary" disabled={disabled || !draft.blob} onClick={save}>{progress >= 0 ? <><LoaderCircle className="spin" size={18}/>{progress} %</> : <><Check size={19}/>{t("Créer mon sticker")}<ArrowRight size={19}/></>}</button><button className="organize-shortcut" onClick={() => setTool(tool === 'organize' ? null : 'organize')} disabled={disabled}><FolderPlus size={14}/>{packId ? packs.find(p => p.id === packId)?.name : t("Nom et pack")}<span>·</span><span>{isAnimated ? t("Animé") : t("Fixe")}</span></button><button className="quiet-button" disabled={disabled} onClick={() => { if (draft.blob) {
            onSave({ ...draft, id: crypto.randomUUID(), name: name.trim() || draft.name, packId: '', createdAt: Date.now() });
            onError(t("Original ajouté à la collection."));
        } }}>{t("Garder seulement l’original")}</button></div>
  </> : sourceTab === 'file' ? <div className="start-actions"><button className="button primary" disabled={!!loading} onClick={() => file.current?.click()}><Plus size={19}/>{t("Choisir un média")}<ArrowRight size={19}/></button><p>{t("Images et animations · 20 Mo max.")}</p></div> : null}
 </section>;
}
