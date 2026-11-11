'use client';
import dynamic from 'next/dynamic';
import {moveToFolder} from '@/lib/stickers/folders';
import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Download, FolderPlus, Heart, HelpCircle, ImagePlus, Layers, LayoutGrid, Link2, LoaderCircle, MoreHorizontal, Pencil, Plus, Search, Settings2, ShieldCheck, Trash2, Undo2, Upload, X, Play, HardDrive, ExternalLink, CheckSquare, Sticker as StickerIcon } from 'lucide-react';
import { type Sticker, type Pack, type Collection, initialCollection, colors } from '@/lib/stickers/types';
import { loadCollection, saveCollection, download, backup, restore } from '@/lib/stickers/store';
import type {DownloadFormat} from '@/lib/stickers/download-format';
import { usePreferences } from '@/components/preferences-provider';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PrivacySettings } from '@/components/zapstick/privacy-settings';
import { clearLocalData } from '@/lib/stickers/store';
import { Studio } from '@/components/zapstick/studio';
import { Media, mediaBlob } from '@/components/zapstick/media';
const CollectionsBoard=dynamic(()=>import('@/components/zapstick/collections-board').then(module=>module.CollectionsBoard));
type View = 'create' | 'collection' | 'packs' | 'settings' | 'help';
const uid = () => crypto.randomUUID();
const message = (e: unknown) => e instanceof Error ? e.message : 'Une erreur est survenue.';
const filename = (value: string) => value.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 70) || 'sticker';
export default function Home() {
    const { t, locale, theme, setTheme, resetPreferences,reduceMotion,setReduceMotion } = usePreferences();
    const [studioResetKey,setStudioResetKey]=useState(0),[creationFolderId,setCreationFolderId]=useState('');
    const [collection, setCollection] = useState<Collection>(initialCollection), [ready, setReady] = useState(false), [storageError, setStorageError] = useState(''), [saveStatus, setSaveStatus] = useState("Enregistré sur cet appareil");
    const [view, setView] = useState<View>('create'), [draft, setDraft] = useState<Sticker | null>(null), [detailId, setDetailId] = useState<string | null>(null), [packId, setPackId] = useState<string | null>(null);
    const [query, setQuery] = useState(''), [showSearch, setShowSearch] = useState(false), [filter, setFilter] = useState('all'), [selectMode, setSelectMode] = useState(false), [selection, setSelection] = useState<string[]>([]), [assigning, setAssigning] = useState(false);
    const [editingPack, setEditingPack] = useState<Pack | null | false>(false), [busy, setBusy] = useState(''), [toast, setToast] = useState(''), [undo, setUndo] = useState<{
        text: string;
        revert: () => void;
    } | null>(null), [pendingRestore, setPendingRestore] = useState<Collection | null>(null), [packTarget, setPackTarget] = useState<string | null>(null), [studioBusy, setStudioBusy] = useState(false);
    const exportAbort=useRef<AbortController|null>(null);
    const saveQueue = useRef(Promise.resolve()), restoreInput = useRef<HTMLInputElement>(null), alive = useRef(true);
    const { stickers, packs } = collection, detail = stickers.find(s => s.id === detailId), currentPack = packs.find(p => p.id === packId);
    useEffect(() => { alive.current = true; loadCollection().then(c => { if (alive.current) {
        setCollection(c);
        setReady(true);
    } }).catch(e => { if (alive.current) {
        setStorageError(message(e));
        setReady(true);
    } }); return () => { alive.current = false; exportAbort.current?.abort(); }; }, []);
    useEffect(() => { if (!ready)
        return; setSaveStatus("Enregistrement…"); saveQueue.current = saveQueue.current.catch(() => { }).then(() => saveCollection(collection)).then(() => { if (alive.current) {
        setSaveStatus("Enregistré sur cet appareil");
        setStorageError('');
    } }).catch(e => { if (alive.current) {
        setSaveStatus("Sauvegarde à vérifier");
        setStorageError(message(e));
    } }); }, [collection, ready]);
    useEffect(() => { if (!toast)
        return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);
    useEffect(() => { if (!undo)
        return; const t = setTimeout(() => setUndo(null), 12000); return () => clearTimeout(t); }, [undo]);
    function navigate(next: View) { if (busy || studioBusy)
        return; if(next==='create')setCreationFolderId(''); setView(next); setDetailId(null); setPackId(null); setSelectMode(false); setSelection([]); setAssigning(false); setPackTarget(null); setEditingPack(false); setQuery(''); setFilter('all'); setShowSearch(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
    function goHome(){if(busy||studioBusy)return;setDraft(null);setStudioResetKey(value=>value+1);navigate('create');}
    function back() { if (busy || studioBusy)
        return; if (detailId) {
        setDetailId(null);
        return;
    } if (editingPack !== false) {
        setEditingPack(false);
        return;
    } if (packId) {
        setPackId(null);
        return;
    } navigate('create'); }
    function add(s: Sticker) { setUndo(null); setCollection(c => ({ ...c, stickers: [{...s,folderId:creationFolderId&&c.folders?.some(folder=>folder.id===creationFolderId)?creationFolderId:s.folderId??''}, ...c.stickers] })); }
    function favorite(id: string) { setCollection(c => ({ ...c, stickers: c.stickers.map(s => s.id === id ? { ...s, favorite: !s.favorite } : s) })); }
    function deleteItems(ids: string[]) { const previous = stickers.filter(s => ids.includes(s.id)); setCollection(c => ({ ...c, stickers: c.stickers.filter(s => !ids.includes(s.id)) })); setDetailId(null); setSelection([]); setSelectMode(false); setUndo({ text: ids.length > 1 ? t('{count} éléments supprimés', { count: ids.length }) : t("Élément supprimé"), revert: () => setCollection(c => ({ ...c, stickers: [...c.stickers, ...previous.filter(s => !c.stickers.some(x => x.id === s.id))] })) }); }
    function deletePack(p: Pack) { const ids = stickers.filter(s => s.packId === p.id).map(s => s.id); setCollection(c => ({ ...c, packs: c.packs.filter(x => x.id !== p.id), stickers: c.stickers.map(s => s.packId === p.id ? { ...s, packId: '' } : s) })); setPackId(null); setEditingPack(false); setUndo({ text: t("Pack supprimé · médias conservés"), revert: () => setCollection(c => ({ ...c, packs: c.packs.some(x => x.id === p.id) ? c.packs : [...c.packs, p], stickers: c.stickers.map(s => ids.includes(s.id) && !s.packId ? { ...s, packId: p.id } : s) })) }); }
    function assign(ids: string[], target: string) { const pack = packs.find(p => p.id === target), items = stickers.filter(s => ids.includes(s.id)); if (pack) {
        if (items.some(s => s.kind !== pack.kind)) {
            setToast(t('Ce pack accepte les stickers {type}.', { type: pack.kind === 'animated' ? t("animés") : t("fixes") }));
            return false;
        }
        if (stickers.filter(s => s.packId === target && !ids.includes(s.id)).length + items.length > 30) {
            setToast(t("Ce pack est limité à 30 éléments."));
            return false;
        }
    } setCollection(c => ({ ...c, stickers: c.stickers.map(s => ids.includes(s.id) ? { ...s, packId: target } : s) })); setAssigning(false); setSelection([]); setSelectMode(false); setToast(pack ? t('Ajouté à {name}', { name: pack.name }) : t("Retiré du pack")); if (packTarget) {
        setView('packs');
        setPackId(packTarget);
        setFilter('all');
        setPackTarget(null);
    } return true; }
    async function edit(s: Sticker) { setBusy(t("Ouverture du média…")); try {
        const blob = await mediaBlob(s);
        setDraft({ ...s, id: uid(), blob });setCreationFolderId(s.folderId??'');
        setView('create');
        setDetailId(null);
        setPackId(null);
        window.scrollTo({ top: 0, behavior: 'instant' });
    }
    catch (e) {
        setToast(message(e));
    }
    finally {
        setBusy('');
    } }
    async function exportItems(items: Sticker[], name = 'mes-stickers',format:DownloadFormat='gallery') {
        if (!items.length || busy || exportAbort.current || studioBusy)return;
        const controller=new AbortController();exportAbort.current=controller;
        setBusy(t("Préparation de l’export…"));
        try {
            const {prepareStickerDownload,checkDownloadSignal}=await import('@/lib/stickers/download-format');
            const files:{name:string;blob:Blob}[]=[];
            for(let i=0;i<items.length;i++){
                checkDownloadSignal(controller.signal);
                const s=items[i];setBusy(t('Export {current}/{total}',{current:i+1,total:items.length}));
                const source=await mediaBlob(s);
                const output=await prepareStickerDownload(source,{animated:s.kind==='animated',isSticker:s.isSticker,format,signal:controller.signal,onProgress:percent=>{if(alive.current&&!controller.signal.aborted)setBusy(items.length===1&&s.kind==='animated'&&format==='gallery'?t('Préparation du GIF… {percent} %',{percent}):t('Export {current}/{total}',{current:i+1,total:items.length}));}});
                files.push({name:`${String(i+1).padStart(2,'0')}-${filename(s.name)}.${output.extension}`,blob:output.blob});
            }
            checkDownloadSignal(controller.signal);
            if(files.length===1)download(files[0].blob,files[0].name);
            else{
                const {zip}=await import('@/lib/stickers/zip');
                files.push({name:'README.txt',blob:new Blob([[t('Créé avec Zapstick'),'',t('Les images fixes sont en WebP, les animations en GIF. Décompresse d’abord le ZIP, puis choisis le média dans WhatsApp.'),t('Les animations sont téléchargées en GIF pour la galerie. WhatsApp peut les envoyer comme GIF ; leur conversion en sticker animé dépend de sa version.'),'https://faq.whatsapp.com/1056840314992666',''].join('\n')],{type:'text/plain;charset=utf-8'})});
                const archive=await zip(files);checkDownloadSignal(controller.signal);download(archive,`${filename(name)}.zip`);
            }
            setToast(t("Export téléchargé"));
        }catch(error){if(alive.current)setToast(t(error instanceof Error&&error.name==='AbortError'?'Export annulé.':message(error)));}
        finally{if(exportAbort.current===controller){exportAbort.current=null;if(alive.current)setBusy('');}}
    }
    const visible = useMemo(() => stickers.filter(s => (!packId || s.packId === packId) && (filter !== 'favorites' || s.favorite) && (filter !== 'animated' || s.kind === 'animated') && (filter !== 'static' || s.kind === 'static') && (!query || s.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)))).sort((a, b) => b.createdAt - a.createdAt), [stickers, packId, filter, query, locale]);
    const hasBack = !!detailId || !!packId || editingPack !== false || view === 'settings' || view === 'help';
    function fillPack(p: Pack) { setView('collection'); setPackId(null); setPackTarget(p.id); setFilter(p.kind); setQuery(''); setSelectMode(true); setSelection([]); setAssigning(false); setEditingPack(false); }
    function toggleSelection(id: string) { setSelection(a => a.includes(id) ? a.filter(x => x !== id) : [...a, id]); }
    return <div className="game-shell">
  <header className={`app-header ${hasBack ? 'with-back' : ''}`}><div className="header-left">{hasBack ? <button className="round-button header-back" aria-label={t("Retour")} disabled={!!busy || studioBusy} onClick={back}><ArrowLeft size={21}/></button> : null}<button className="wordmark" onClick={goHome} disabled={!!busy||studioBusy} aria-label={t("Zapstick accueil")}><img className="logo-mark" src="/brand/zapstick-mark.svg" alt="" width={29} height={29}/>zapstick</button></div><div className="header-actions"><LanguageSwitcher disabled={!!busy || studioBusy}/><button className={`round-button ${view === 'settings' ? 'is-active' : ''}`} aria-label={t("Réglages et sauvegarde")} onClick={() => navigate('settings')} disabled={!!busy || studioBusy}><Settings2 size={20}/></button></div></header>
  <main className="app-main" id="main-content" tabIndex={-1}>
   {storageError ? <div className="inline-error storage-alert" role="alert">{t(storageError)}<button onClick={() => navigate('settings')}>{t("Sauvegarder")}</button></div> : null}
   {!ready ? <div className="opening-state"><LoaderCircle size={24} className="spin"/><span>{t("Ouverture de la collection…")}</span></div> : <Studio key={studioResetKey} draft={draft} active={view === 'create'} packs={packs} stickers={stickers} onDraft={setDraft} onSave={add} onError={setToast} onCollection={() => navigate('collection')} onWorking={setStudioBusy}/>}
   {ready&&view==='collection'&&!packTarget?<CollectionsBoard collection={collection} onChange={setCollection} hidden={!!detail} onOpen={setDetailId} onCreate={folderId=>{navigate('create');setCreationFolderId(folderId);}} onFavorite={favorite} onDelete={deleteItems} onExport={exportItems} onNotify={setToast} onUndo={setUndo} disabled={!!busy||studioBusy}/>:null}
   {ready && (view === 'collection' && packTarget || view === 'packs' && packId) && !detail ? <section className="screen collection-screen">
    <div className="screen-title"><div><h1>{currentPack?.name ?? t("Collection")}<span className="title-count">{currentPack ? visible.length : stickers.length}</span></h1></div><div className="title-buttons">{currentPack ? <><button className="round-button accent" aria-label={t("Ajouter des stickers au pack")} onClick={() => fillPack(currentPack)}><Plus size={20}/></button><button className="round-button" aria-label={t("Modifier le pack")} onClick={() => setEditingPack(currentPack)}><Pencil size={18}/></button></> : <button className="round-button" aria-label={t("Rechercher un sticker")} aria-expanded={showSearch} onClick={() => setShowSearch(p => !p)}><Search size={19}/></button>}<button className={`round-button ${selectMode ? 'is-active' : ''}`} aria-label={selectMode ? t("Terminer la sélection") : t("Sélectionner des stickers")} onClick={() => { setSelectMode(p => !p); setSelection([]); setAssigning(false); }}><CheckSquare size={19}/></button></div></div>
    {editingPack && currentPack ? <PackForm pack={editingPack} onCancel={() => setEditingPack(false)} onSave={p => { setCollection(c => ({ ...c, packs: c.packs.map(x => x.id === p.id ? p : x) })); setEditingPack(false); }} onDelete={() => deletePack(currentPack)}/> : null}
    {showSearch ? <div className="collection-search"><Search size={17}/><input autoFocus aria-label={t("Rechercher dans la collection")} placeholder={t("Chercher un sticker")} value={query} onChange={e => setQuery(e.target.value)}/>{query ? <button aria-label={t("Effacer la recherche")} onClick={() => setQuery('')}><X size={15}/></button> : null}</div> : null}
    <div className="collection-filters" role="group" aria-label={t("Filtrer la collection")}>{[['all', t("Tout")], ['animated', t("Animés")], ['static', t("Fixes")], ['favorites', t("Favoris")]].map(([id, label]) => <button key={id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{id === 'favorites' ? <Heart size={12}/> : id === 'animated' ? <Play size={11}/> : null}{label}</button>)}</div>
    {selectMode ? <div className="selection-summary"><button onClick={() => setSelection(selection.length === visible.length ? [] : visible.map(s => s.id))}>{selection.length === visible.length && visible.length ? t("Tout retirer") : t("Tout choisir")}</button><span>{t('Sélection : {count}', { count: selection.length })}</span></div> : null}
    {assigning ? <div className="inline-pack-picker"><strong>{t("Ajouter à un pack")}</strong>{packs.length ? packs.map(p => <button key={p.id} onClick={() => assign(selection, p.id)}><span style={{ background: p.color }}/>{p.name}<small>{p.kind === 'animated' ? t("Animé") : t("Fixe")}</small><ArrowRight size={15}/></button>) : <p>{t("Crée d’abord un pack dans l’onglet Packs.")}</p>}<button className="quiet-button" onClick={() => setAssigning(false)}>{t("Annuler")}</button></div> : null}
    {visible.length ? <div className="collection-grid">{visible.map(s => <StickerCard key={s.id} sticker={s} selected={selection.includes(s.id)} selecting={selectMode} onOpen={() => selectMode ? toggleSelection(s.id) : setDetailId(s.id)} onHold={() => { setSelectMode(true); setSelection(a => a.includes(s.id) ? a : [...a, s.id]); }} onFavorite={() => favorite(s.id)}/>)}<button className="add-tile" onClick={() => navigate('create')} aria-label={t("Créer un nouveau sticker")}><Plus size={24}/></button></div> : <Empty icon={filter === 'favorites' ? <Heart size={31}/> : <StickerIcon size={34}/>} title={query ? t("Aucun résultat") : currentPack ? t("Ce pack est vide") : filter !== 'all' ? t("Rien ici pour l’instant") : t("Collection vide")} text={query ? t("Essaie un autre mot.") : currentPack ? t("Choisis des stickers dans ta collection.") : filter === 'favorites' ? t("Touche le cœur sur un sticker pour le garder ici.") : t("Ajoute une image, un GIF ou une vidéo.")} action={query ? t("Effacer la recherche") : currentPack ? t("Ajouter des stickers") : filter !== 'all' ? t("Tout afficher") : t("Créer un sticker")} onAction={() => query ? setQuery('') : currentPack ? fillPack(currentPack) : filter !== 'all' ? setFilter('all') : navigate('create')}/>}
    {currentPack && visible.length ? <button className="button secondary full-width pack-export" disabled={!!busy || studioBusy} onClick={() => exportItems(stickers.filter(s => s.packId === currentPack.id), currentPack.name)}><Download size={18}/>{t("Exporter le pack")}</button> : null}
    {selectMode && selection.length ? <div className="selection-actions"><button onClick={() => packTarget ? assign(selection, packTarget) : setAssigning(p => !p)}><FolderPlus size={20}/><span>{packTarget ? t("Ajouter") : t("Ranger")}</span></button><button disabled={!!busy || studioBusy} onClick={() => exportItems(stickers.filter(s => selection.includes(s.id)))}><Download size={20}/><span>{t("Exporter")}</span></button><button onClick={() => deleteItems(selection)}><Trash2 size={19}/><span>{t("Supprimer")}</span></button><button aria-label={t("Fermer la sélection")} onClick={() => { setSelectMode(false); setSelection([]); setAssigning(false); }}><X size={19}/></button></div> : null}
   </section> : null}
   {ready && detail && (view === 'collection' || view === 'packs') ? <section className="screen detail-screen"><div className="screen-title"><div><h1>{detail.kind === 'animated' ? t("Sticker animé") : t("Ton sticker")}</h1></div><button className={`round-button ${detail.favorite ? 'is-favorite' : ''}`} aria-label={detail.favorite ? t("Retirer des favoris") : t("Ajouter aux favoris")} onClick={() => favorite(detail.id)}><Heart size={20} fill={detail.favorite ? 'currentColor' : 'none'}/></button></div><div className="detail-stage checker"><Media sticker={detail}/>{detail.kind === 'animated' ? <span className="stage-format"><Play size={9} fill="currentColor"/>{t("ANIMÉ")}</span> : null}</div><input className="sticker-name" aria-label={t("Nom du sticker")} maxLength={120} value={detail.name} onChange={e => setCollection(c => ({ ...c, stickers: c.stickers.map(s => s.id === detail.id ? { ...s, name: e.target.value } : s) }))} onBlur={() => { if (!detail.name.trim())
        setCollection(c => ({ ...c, stickers: c.stickers.map(s => s.id === detail.id ? { ...s, name: t("Mon sticker") } : s) })); }}/><div className="sticker-specs"><span>{detail.isSticker ? '512 × 512 · WebP' : detail.mime.split('/')[1].toUpperCase()}</span><span>{detail.blob ? `${Math.round(detail.blob.size / 1024)} ${t("Ko")}` : ''}</span></div><div className="two-actions"><button className="button primary" disabled={!!busy || studioBusy} onClick={() => exportItems([detail])}><Download size={18}/>{detail.kind==='animated'?t("Télécharger le GIF animé"):t("Télécharger")}</button><button className="button secondary" disabled={!!busy || studioBusy} onClick={() => edit(detail)}><Pencil size={18}/>{detail.isSticker ? t("Modifier") : t("Créer")}</button></div>{detail.kind==='animated'?<button className="quiet-button" disabled={!!busy||studioBusy} onClick={()=>exportItems([detail],detail.name,'webp')}>{t("Télécharger le WebP")}</button>:null}<label className="pack-select-row"><FolderPlus size={17}/>{t('Collection du sticker')}<select aria-label={t('Collection du sticker')} value={detail.folderId??''} onChange={e=>{setUndo(null);setCollection(value=>moveToFolder(value,[detail.id],e.target.value));}}><option value="">{t('À ranger')}</option>{(collection.folders??[]).map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><ChevronDown size={14}/></label><label className="pack-select-row"><Layers size={17}/>{t("Pack du sticker")}<select aria-label={t("Pack du sticker")} value={detail.packId} onChange={e => assign([detail.id], e.target.value)}><option value="">{t("Sans pack")}</option>{packs.filter(p => p.kind === detail.kind).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><ChevronDown size={14}/></label><div className="detail-bottom"><button onClick={async () => { try {
        download(await mediaBlob(detail), `${filename(detail.name)}.${detail.mime.split('/')[1].replace('svg+xml', 'svg')}`);
    }
    catch (e) {
        setToast(message(e));
    } }}>{t("Fichier original")}<Download size={13}/></button><button aria-label={t("Supprimer le sticker")} onClick={() => deleteItems([detail.id])}><Trash2 size={17}/></button></div></section> : null}
   {ready && view === 'packs' && !packId ? <section className="screen packs-screen"><div className="screen-title"><div><h1>{t("Tes packs")}<span className="title-count">{packs.length}</span></h1></div><button className="round-button accent" aria-label={t("Créer un pack")} onClick={() => setEditingPack(editingPack === false ? null : false)}><Plus size={21}/></button></div>{editingPack !== false ? <PackForm pack={null} onCancel={() => setEditingPack(false)} onSave={p => { setCollection(c => ({ ...c, packs: [...c.packs, p] })); setEditingPack(false); setPackId(p.id); setToast(t("Pack créé")); }}/> : null}{packs.length ? <div className="pack-grid">{packs.map(p => { const members = stickers.filter(s => s.packId === p.id); return <button className="pack-box" key={p.id} onClick={() => { setPackId(p.id); setEditingPack(false); }}><div className="pack-art" style={{ background: p.color }}>{members.length ? members.slice(0, 3).map((s, i) => <div className={`pack-mini pack-mini-${i}`} key={s.id}><Media sticker={s}/></div>) : <Layers size={38} strokeWidth={1.4}/>}<span className="pack-count">{members.length}/30</span></div><div className="pack-box-name"><strong>{p.name}</strong><ArrowRight size={17}/></div><small>{p.kind === 'animated' ? t("Animés") : t("Fixes")}</small></button>; })}</div> : editingPack === false ? <Empty icon={<Layers size={35}/>} title={t("Aucun pack")} text={t("Organise tes stickers par pack.")} action={t("Créer un pack")} onAction={() => setEditingPack(null)}/> : null}<button className="help-link" onClick={() => navigate('help')}><HelpCircle size={15}/>{t("Comment les ajouter à WhatsApp ?")}<ArrowRight size={14}/></button></section> : null}
   {view === 'settings' ? <section className="screen settings-screen"><div className="screen-title"><div><h1>{t("Réglages")}</h1></div></div><div className="local-summary"><span className="local-summary-icon"><HardDrive size={22}/></span><div><strong>{t('Éléments : {count} · Packs : {packs}', { count: stickers.length, packs: packs.length })}</strong><p><span className={storageError ? 'status-dot error' : 'status-dot'}/>{t(saveStatus)}</p></div></div><div className="settings-group preferences-settings"><div className="preference-control"><h2>{t("Apparence")}</h2><div className="theme-options" role="group" aria-label={t("Thème de l’interface")}>{([['system', t("Système")], ['light', t("Clair")], ['dark', t("Sombre")]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={theme === value} className={theme === value ? 'selected' : ''} onClick={() => setTheme(value)}>{label}</button>)}</div></div><label className="preference-control motion-preference"><span>{t("Réduire les animations")}</span><input type="checkbox" checked={reduceMotion} onChange={e=>setReduceMotion(e.target.checked)}/></label></div><div className="settings-group"><h2>{t("Ta sauvegarde")}</h2><button className="settings-row" disabled={!!busy || studioBusy} onClick={async () => { setBusy(t("Préparation de la sauvegarde…")); try {
        await backup(collection);
        setToast(t("Sauvegarde téléchargée"));
    }
    catch (e) {
        setToast(message(e));
    }
    finally {
        setBusy('');
    } }}><Download size={19}/><span>{t("Télécharger une copie")}</span><ArrowRight size={16}/></button><button className="settings-row" disabled={!!busy || studioBusy} onClick={() => restoreInput.current?.click()}><Upload size={19}/><span>{t("Restaurer une sauvegarde")}</span><ArrowRight size={16}/></button><input hidden type="file" ref={restoreInput} accept=".json,application/json" onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file)
        return; setBusy(t("Lecture de la sauvegarde…")); try {
        setPendingRestore(await restore(file));
    }
    catch (err) {
        setToast(message(err));
    }
    finally {
        setBusy('');
    } }}/>{pendingRestore ? <div className="restore-confirm"><strong>{t('{count} éléments à restaurer', { count: pendingRestore.stickers.length })}</strong><p>{t("Cette sauvegarde remplacera la collection actuelle.")}</p><div className="two-actions"><button className="button secondary" onClick={() => setPendingRestore(null)}>{t("Annuler")}</button><button className="button primary" onClick={() => { const previous = collection; setCollection(pendingRestore); setPendingRestore(null); setUndo({ text: t("Sauvegarde restaurée"), revert: () => setCollection(previous) }); }}>{t("Restaurer")}</button></div></div> : null}</div><div className="settings-group"><button className="settings-row" onClick={() => navigate('help')}><HelpCircle size={19}/><span>{t("Utiliser avec WhatsApp")}</span><ArrowRight size={16}/></button></div><PrivacySettings privacyHref={`/${locale}/privacy`} legalHref={`/${locale}/legal`} onClearData={async () => { if(busy||studioBusy)throw new Error(t('En attente de la fin de l’opération en cours.'));await saveQueue.current; await clearLocalData(); setStudioResetKey(value=>value+1);setCollection(initialCollection()); setDraft(null); setDetailId(null); setPackId(null); setUndo(null); setPendingRestore(null); setSelection([]); setSelectMode(false); setAssigning(false); setQuery(''); resetPreferences(); setToast(t('Les données locales ont été effacées.')); }}/></section> : null}
   {view === 'help' ? <section className="screen help-screen"><div className="screen-title"><div><h1>WhatsApp</h1></div></div><div className="help-steps">{[{ title: t("Crée tes stickers"), text: t("Importe une image, un GIF ou une vidéo dans l’atelier.") }, { title: t("Enregistre dans ta galerie"), text: t("Télécharge ton sticker puis enregistre-le dans la galerie de ton téléphone.") }, { title: t("Ajoute-les à WhatsApp"), text: t("Dans une discussion WhatsApp, ouvre Stickers → Créer, puis choisis ton média dans la galerie. Tu peux créer et envoyer ton sticker directement, sans autre application.") }].map((step, i) => <div key={step.title}><span>{i + 1}</span><div><h2>{step.title}</h2><p>{step.text}</p></div></div>)}</div><div className="help-note"><Layers size={19}/><p>{t("Les animations sont téléchargées en GIF pour la galerie. WhatsApp peut les envoyer comme GIF ; leur conversion en sticker animé dépend de sa version.")}</p></div><a className="help-link" href="https://faq.whatsapp.com/1056840314992666" target="_blank" rel="noreferrer">{t("Guide officiel WhatsApp")}<ExternalLink size={14}/></a><button className="button primary full-width" onClick={() => navigate('create')}>{t("Créer un sticker")}<ArrowRight size={18}/></button></section> : null}
  </main>
  <nav className="bottom-nav" aria-label={t("Navigation principale")}><button className={view === 'collection' ? 'active' : ''} aria-current={view === 'collection' ? 'page' : undefined} onClick={() => navigate('collection')} disabled={!!busy || studioBusy}><LayoutGrid size={21}/><span>{t("Collection")}</span>{stickers.length ? <small>{stickers.length}</small> : null}</button><button className={`create-nav ${view === 'create' ? 'active' : ''}`} aria-current={view === 'create' ? 'page' : undefined} onClick={() => navigate('create')} disabled={!!busy || studioBusy}><span className="create-nav-icon"><Plus size={26}/></span><span>{t("Créer")}</span></button><button className={view === 'packs' ? 'active' : ''} aria-current={view === 'packs' ? 'page' : undefined} onClick={() => navigate('packs')} disabled={!!busy || studioBusy}><Layers size={22}/><span>{t("Packs")}</span>{packs.length ? <small>{packs.length}</small> : null}</button></nav>
  {busy ? <div className="app-toast busy-toast" role="status"><LoaderCircle size={17} className="spin"/>{t(busy)}{exportAbort.current?<button onClick={()=>exportAbort.current?.abort()}>{t("Annuler")}</button>:null}</div> : null}
  {undo ? <div className="app-toast undo-toast" role="status"><span>{t(undo.text)}</span><button onClick={() => { undo.revert(); setUndo(null); }}><Undo2 size={16}/>{t("Annuler")}</button></div> : toast ? <div className="app-toast" role="status"><Check size={17}/><span>{t(toast)}</span><button aria-label={t("Fermer le message")} onClick={() => setToast('')}><X size={15}/></button></div> : null}
 </div>;
}
function Empty({ icon, title, text, action, onAction }: {
    icon: ReactNode;
    title: string;
    text: string;
    action: string;
    onAction: () => void;
}) { const { t } = usePreferences(); return <div className="empty-collection"><div className="empty-collection-art"><span />{icon}<span /></div><h2>{title}</h2><p>{text}</p><button className="button primary" onClick={onAction}>{action}<ArrowRight size={17}/></button></div>; }
function StickerCard({ sticker, selected, selecting, onOpen, onHold, onFavorite }: {
    sticker: Sticker;
    selected: boolean;
    selecting: boolean;
    onOpen: () => void;
    onHold: () => void;
    onFavorite: () => void;
}) {
    const { t } = usePreferences();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null), held = useRef(false), start = useRef({ x: 0, y: 0 });
    function cancel() { if (timer.current)
        clearTimeout(timer.current); timer.current = null; }
    useEffect(() => cancel, []);
    return <article className={`sticker-card ${selected ? 'selected' : ''}`}><button className="card-media" aria-label={selecting ? t('Sélectionner {name}', { name: sticker.name }) : t('Ouvrir {name}', { name: sticker.name })} aria-pressed={selecting ? selected : undefined} onPointerDown={e => { held.current = false; start.current = { x: e.clientX, y: e.clientY }; timer.current = setTimeout(() => { held.current = true; onHold(); }, 450); }} onPointerMove={e => { if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10)
        cancel(); }} onPointerUp={cancel} onPointerCancel={cancel} onClick={() => { if (!held.current)
        onOpen(); held.current = false; }}><Media sticker={sticker}/>{sticker.kind === 'animated' ? <span className="card-animation"><Play size={8} fill="currentColor"/></span> : null}{selecting ? <span className={`card-check ${selected ? 'checked' : ''}`}>{selected ? <Check size={12}/> : null}</span> : null}</button>{!selecting ? <button className={`card-favorite ${sticker.favorite ? 'favorited' : ''}`} aria-label={sticker.favorite ? t('Retirer {name} des favoris', { name: sticker.name }) : t('Ajouter {name} aux favoris', { name: sticker.name })} onClick={onFavorite}><Heart size={14} fill={sticker.favorite ? 'currentColor' : 'none'}/></button> : null}<button className="card-title" onClick={onOpen}>{sticker.name}</button></article>;
}
function PackForm({ pack, onSave, onCancel, onDelete }: {
    pack: Pack | null;
    onSave: (p: Pack) => void;
    onCancel: () => void;
    onDelete?: () => void;
}) {
    const { t } = usePreferences();
    const [name, setName] = useState(pack?.name ?? ''), [kind, setKind] = useState<'static' | 'animated'>(pack?.kind ?? 'static'), [color, setColor] = useState(pack?.color ?? colors[0]);
    return <form className="pack-form" onSubmit={e => { e.preventDefault(); if (name.trim())
        onSave({ id: pack?.id ?? uid(), name: name.trim(), kind, color }); }}><div className="tool-panel-heading"><strong>{pack ? t("Modifier le pack") : t("Nouveau pack")}</strong><button type="button" className="small-icon" aria-label={t("Annuler la modification du pack")} onClick={onCancel}><X size={17}/></button></div><input className="field" autoFocus aria-label={t("Nom du pack")} placeholder={t("Nom du pack")} required maxLength={80} value={name} onChange={e => setName(e.target.value)}/>{!pack ? <div className="segmented"><button type="button" className={kind === 'static' ? 'selected' : ''} onClick={() => setKind('static')}>{t("Fixes")}</button><button type="button" className={kind === 'animated' ? 'selected' : ''} onClick={() => setKind('animated')}><Play size={12}/>{t("Animés")}</button></div> : null}<div className="swatches pack-colors">{colors.map(c => <button key={c} type="button" style={{ background: c }} aria-label={t('Couleur {color}', { color: c })} aria-pressed={color === c} className={color === c ? 'chosen' : ''} onClick={() => setColor(c)}>{color === c ? <Check size={16}/> : null}</button>)}</div><button className="button primary full-width" type="submit"><Check size={18}/>{pack ? t("Enregistrer") : t("Créer le pack")}</button>{onDelete ? <button className="quiet-button danger" type="button" onClick={onDelete}><Trash2 size={15}/>{t("Supprimer le pack")}</button> : null}</form>;
}
