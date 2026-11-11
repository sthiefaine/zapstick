'use client';

import {useEffect,useId,useMemo,useRef,useState,type Dispatch,type SetStateAction,type CSSProperties,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {DndContext,DragOverlay,MouseSensor,TouchSensor,KeyboardSensor,useSensor,useSensors,useDroppable,pointerWithin,closestCenter,type CollisionDetection,type DragEndEvent} from '@dnd-kit/core';
import {SortableContext,useSortable,rectSortingStrategy,horizontalListSortingStrategy,sortableKeyboardCoordinates} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {Check,CheckSquare,Download,Folder,FolderOpen,FolderPlus,GripVertical,Heart,ImagePlus,Inbox,MoreHorizontal,Pencil,Play,Plus,Search,Trash2,Upload,X} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import type {Collection,CollectionFolder,Sticker} from '@/lib/stickers/types';
import {createFolder,updateFolder,deleteFolder,moveToFolder,reorderStickers,reorderFolders} from '@/lib/stickers/folders';
import {Media} from './media';
import {inferMediaKind} from '@/lib/stickers/media-kind';
import './collections-board.css';

type Undo={text:string;revert:()=>void};
type Props={collection:Collection;onChange:Dispatch<SetStateAction<Collection>>;onOpen:(id:string)=>void;onCreate:(folderId:string)=>void;onFavorite:(id:string)=>void;onDelete:(ids:string[])=>void;onExport:(items:Sticker[],name?:string)=>void;onNotify:(text:string)=>void;onUndo:(value:Undo|null)=>void;disabled?:boolean;hidden?:boolean};
type DragData={kind:'folder'|'sticker'|'target'|'tail';entityId:string;label:string};
const folderKey=(id:string)=>`folder:${id}`,stickerKey=(id:string)=>`sticker:${id}`;
const folderColors=['#cdebbb','#e7f0df','#f6c1a3','#e9dfbd','#cbdce6','#e4e4e7'];
const accepted=['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];

export function CollectionsBoard({collection,onChange,onOpen,onCreate,onFavorite,onDelete,onExport,onNotify,onUndo,disabled=false,hidden=false}:Props){
 const {t,locale,reduceMotion}=usePreferences(),contextId=useId();
 const [folderId,setFolderId]=useState<string|null>(null),[query,setQuery]=useState(''),[searching,setSearching]=useState(false),[filter,setFilter]=useState('all');
 const [selecting,setSelecting]=useState(false),[selected,setSelected]=useState<string[]>([]),[moving,setMoving]=useState(false),[form,setForm]=useState<CollectionFolder|null|false>(false);
 const [drag,setDrag]=useState<DragData|null>(null),[dragIds,setDragIds]=useState<string[]>([]),[mounted,setMounted]=useState(false),[external,setExternal]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null),importRequest=useRef(0),alive=useRef(true);
 const folders=collection.folders??[],currentFolder=folders.find(folder=>folder.id===folderId);
 const visible=useMemo(()=>collection.stickers.filter(sticker=>(folderId===null||(sticker.folderId??'')===folderId)&&(filter!=='favorites'||sticker.favorite)&&(filter!=='animated'||sticker.kind==='animated')&&(filter!=='static'||sticker.kind==='static')&&(!query||sticker.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale)))),[collection.stickers,folderId,filter,query,locale]);
 const sensors=useSensors(useSensor(MouseSensor,{activationConstraint:{distance:8}}),useSensor(TouchSensor,{activationConstraint:{delay:250,tolerance:5}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
 useEffect(()=>{alive.current=true;setMounted(true);return()=>{alive.current=false;importRequest.current++;};},[]);
 useEffect(()=>{if(folderId&&!folders.some(folder=>folder.id===folderId))setFolderId(null);},[folderId,folders]);
 useEffect(()=>{setSelected([]);setSelecting(false);setMoving(false);},[folderId,filter,query]);
 useEffect(()=>{setSelected(items=>items.filter(id=>collection.stickers.some(sticker=>sticker.id===id)));},[collection.stickers]);
 function apply(change:(value:Collection)=>Collection,notice:string){try{const next=change(collection);if(next===collection)return;onUndo(null);onChange(next);onNotify(t(notice));}catch(error){onNotify(t(error instanceof Error?error.message:'Une erreur est survenue.'));}}
 function move(ids:string[],target:string){apply(value=>moveToFolder(value,ids,target),'Stickers déplacés');setMoving(false);setSelecting(false);setSelected([]);}
 function toggle(id:string){setSelected(items=>items.includes(id)?items.filter(value=>value!==id):[...items,id]);}
 function changeFolder(id:string|null){if(drag)return;setFolderId(id);setForm(false);}
 function saveFolder(value:CollectionFolder){try{const exists=folders.some(folder=>folder.id===value.id);const next=exists?updateFolder(collection,value.id,value):createFolder(collection,value);onUndo(null);onChange(next);setForm(false);if(!exists)setFolderId(value.id);onNotify(t(exists?'Collection mise à jour':'Collection créée'));}catch(error){onNotify(t(error instanceof Error?error.message:'Une erreur est survenue.'));}}
 function removeFolder(folder:CollectionFolder){
  const index=folders.findIndex(value=>value.id===folder.id),members=collection.stickers.filter(sticker=>sticker.folderId===folder.id).map(sticker=>sticker.id);
  onChange(value=>deleteFolder(value,folder.id));setForm(false);setFolderId(null);
  onUndo({text:t('Collection supprimée · stickers conservés'),revert:()=>onChange(value=>{if(value.folders?.some(item=>item.id===folder.id))return value;let next=createFolder(value,folder);const target=(value.folders??[])[index]?.id??null;next=reorderFolders(next,folder.id,target);return moveToFolder(next,next.stickers.filter(sticker=>members.includes(sticker.id)&&!sticker.folderId).map(sticker=>sticker.id),folder.id);})});
 }
 async function importFiles(files:File[]){
  setExternal(false);if(disabled||!files.length)return;
  if(files.length>30){onNotify(t('Importe jusqu’à 30 fichiers à la fois.'));return;}
  if(files.reduce((sum,file)=>sum+file.size,0)>100*1024*1024){onNotify(t('L’import est limité à 100 Mo à la fois.'));return;}
  if(files.some(file=>file.size>20*1024*1024)){onNotify(t('Choisis un fichier de moins de 20 Mo.'));return;}
  if(files.some(file=>!accepted.includes(file.type))){onNotify(t('Formats acceptés : JPG, PNG, WebP, GIF et vidéo MP4 / WebM.'));return;}
  const target=folderId&&folders.some(folder=>folder.id===folderId)?folderId:'';
  const request=importRequest.current;
  try{
   const imported:Sticker[]=await Promise.all(files.map(async(file,index)=>({id:crypto.randomUUID(),name:file.name.replace(/\.[^.]+$/,'').slice(0,120)||t('Mon sticker'),packId:'',folderId:target,kind:await inferMediaKind(file),mime:file.type,blob:file,favorite:false,createdAt:Date.now()+files.length-index,isSticker:false})));
   if(!alive.current||request!==importRequest.current)return;
   onUndo(null);onChange(value=>({...value,stickers:[...imported.map(sticker=>({...sticker,folderId:target&&value.folders?.some(folder=>folder.id===target)?target:''})),...value.stickers]}));onNotify(t('{count} médias importés',{count:imported.length}));
  }catch(error){if(alive.current&&request===importRequest.current)onNotify(t(error instanceof Error?error.message:'Une erreur est survenue.'));}
 }
 const collisions:CollisionDetection=args=>{
  const kind=args.active.data.current?.kind;
  const containers=args.droppableContainers.filter(container=>{const data=container.data.current as DragData|undefined;return data&&(kind==='folder'?data.kind==='folder':data.kind!=='sticker'||!dragIds.includes(data.entityId));});
  const hits=pointerWithin({...args,droppableContainers:containers});
  if(hits.length){const exact=hits.filter(hit=>args.droppableContainers.find(container=>container.id===hit.id)?.data.current?.kind!=='tail');return exact.length?exact:hits;}
  return args.pointerCoordinates?[]:closestCenter({...args,droppableContainers:containers});
 };
 function endDrag(event:DragEndEvent){
  const data=event.active.data.current as DragData|undefined,target=event.over?.data.current as DragData|undefined,ids=dragIds;
  setDrag(null);setDragIds([]);if(!data||!target||event.active.id===event.over?.id)return;
  if(data.kind==='folder'&&target.kind==='folder'){
   const from=folders.findIndex(folder=>folder.id===data.entityId),to=folders.findIndex(folder=>folder.id===target.entityId);
   apply(value=>reorderFolders(value,data.entityId,from<to?folders[to+1]?.id??null:target.entityId),'Ordre enregistré');
  }else if(data.kind==='sticker'){
   if(target.kind==='folder'||target.kind==='target')move(ids,target.entityId);
   else if(target.kind==='sticker'||target.kind==='tail'){
    const remaining=visible.filter(sticker=>!ids.includes(sticker.id)),from=visible.findIndex(sticker=>sticker.id===data.entityId),to=visible.findIndex(sticker=>sticker.id===target.entityId);
    const before=target.kind==='tail'?null:from<to?remaining[remaining.findIndex(sticker=>sticker.id===target.entityId)+1]?.id??null:target.entityId;
    apply(value=>reorderStickers(value,ids,before,visible.map(sticker=>sticker.id)),'Ordre enregistré');
   }
  }
 }
 const draggedSticker=drag?.kind==='sticker'?collection.stickers.find(sticker=>sticker.id===drag.entityId):undefined;
 return <section hidden={hidden} className={`screen collection-screen library-board ${drag?'library-dragging':''} ${external?'library-external':''}`} onDragOver={event=>{if(Array.from(event.dataTransfer.types).includes('Files')){event.preventDefault();setExternal(true);}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setExternal(false);}} onDrop={event=>{if(event.dataTransfer.files.length){event.preventDefault();importFiles(Array.from(event.dataTransfer.files));}}}>
  <input ref={fileInput} type="file" hidden multiple accept={accepted.join(',')} onChange={event=>{importFiles(Array.from(event.target.files??[]));event.target.value='';}}/>
  <div className="screen-title"><h1>{t('Collection')}<span className="title-count">{collection.stickers.length}</span></h1><div className="title-buttons"><button className="round-button" aria-label={t('Rechercher un sticker')} aria-expanded={searching} onClick={()=>setSearching(value=>!value)}><Search size={19}/></button><button className={`round-button ${selecting?'is-active':''}`} aria-label={t(selecting?'Terminer la sélection':'Sélectionner des stickers')} aria-pressed={selecting} onClick={()=>{setSelecting(value=>!value);setSelected([]);setMoving(false);}}><CheckSquare size={19}/></button></div></div>
  {searching?<div className="collection-search"><Search size={17}/><input autoFocus aria-label={t('Rechercher dans la collection')} placeholder={t('Chercher un sticker')} value={query} onChange={event=>setQuery(event.target.value)}/><button aria-label={t('Effacer la recherche')} onClick={()=>setQuery('')}><X size={16}/></button></div>:null}
  <DndContext id={contextId} sensors={sensors} collisionDetection={collisions} accessibility={{screenReaderInstructions:{draggable:t('Espace pour saisir, flèches pour déplacer, Espace pour déposer, Échap pour annuler.')},announcements:{onDragStart:({active})=>t('{name} saisi.',{name:active.data.current?.label??''}),onDragOver:({over})=>over?t('Au-dessus de {name}.',{name:over.data.current?.label??''}):undefined,onDragEnd:({active})=>t('{name} déposé.',{name:active.data.current?.label??''}),onDragCancel:()=>t('Déplacement annulé.')}}} onDragStart={({active})=>{const data=active.data.current as DragData;setDrag(data);setDragIds(data.kind==='sticker'?(selected.includes(data.entityId)?selected:[data.entityId]):[]);setMoving(false);}} onDragCancel={()=>{setDrag(null);setDragIds([]);}} onDragEnd={endDrag}>
   <div className="folder-zone"><div className="folder-zone-title"><h2>{t('Mes collections')}</h2>{folders.length?<button className="small-icon" aria-label={t('Nouvelle collection')} onClick={()=>setForm(null)} disabled={disabled}><FolderPlus size={21}/></button>:null}</div>
    <div className="folder-scopes"><button className={folderId===null?'selected':''} aria-pressed={folderId===null} onClick={()=>changeFolder(null)}>{t('Tous les stickers')}</button><FolderTarget label={t('À ranger')} count={collection.stickers.filter(sticker=>!sticker.folderId).length} selected={folderId===''} onOpen={()=>changeFolder('')} disabled={disabled}/></div>
    {folders.length?<SortableContext items={folders.map(folder=>folderKey(folder.id))} strategy={horizontalListSortingStrategy}><div className="folder-rail">{folders.map(folder=><FolderTile key={folder.id} folder={folder} count={collection.stickers.filter(sticker=>sticker.folderId===folder.id).length} selected={folderId===folder.id} disabled={disabled} onOpen={()=>changeFolder(folder.id)} onEdit={()=>setForm(folder)}/>)}</div></SortableContext>:form===false?<button className="button secondary library-new-folder" onClick={()=>setForm(null)}><FolderPlus size={18}/>{t('Créer une collection')}</button>:null}
   </div>
   {form!==false?<FolderForm key={form?.id??'new'} folder={form} onSave={saveFolder} onCancel={()=>setForm(false)} onDelete={form?()=>removeFolder(form):undefined}/>:null}
   <div className="library-items-heading"><h2>{currentFolder?.name??t(folderId===''?'À ranger':'Tous les stickers')} <small>{visible.length}</small></h2><div>{currentFolder?<button className="small-icon" aria-label={t('Modifier la collection')} onClick={()=>setForm(currentFolder)}><Pencil size={17}/></button>:null}{visible.length?<button className="small-icon" aria-label={t('Importer des médias')} onClick={()=>fileInput.current?.click()} disabled={disabled}><Upload size={18}/></button>:null}</div></div>
   <div className="collection-filters" role="group" aria-label={t('Filtrer la collection')}>{[['all','Tout'],['animated','Animés'],['static','Fixes'],['favorites','Favoris']].map(([value,label])=><button key={value} className={filter===value?'selected':''} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==='favorites'?<Heart size={12}/>:null}{t(label)}</button>)}</div>
   {selecting?<div className="selection-summary"><button onClick={()=>setSelected(selected.length===visible.length?[]:visible.map(sticker=>sticker.id))}>{t(selected.length===visible.length&&visible.length?'Tout retirer':'Tout choisir')}</button><span>{t('Sélection : {count}',{count:selected.length})}</span></div>:null}
   {moving?<div className="library-move-picker"><strong>{t('Déplacer vers…')}</strong><button onClick={()=>move(selected,'')}><Inbox size={17}/>{t('À ranger')}</button>{folders.map(folder=><button key={folder.id} onClick={()=>move(selected,folder.id)}><Folder size={17} fill={folder.color}/>{folder.name}</button>)}<button className="quiet-button" onClick={()=>setMoving(false)}>{t('Annuler')}</button></div>:null}
  {selected.length?<div className="selection-actions library-actions"><button onClick={()=>setMoving(value=>!value)}><FolderPlus size={20}/><span>{t('Déplacer vers…')}</span></button><button disabled={disabled} onClick={()=>onExport(collection.stickers.filter(sticker=>selected.includes(sticker.id)),currentFolder?.name)}><Download size={20}/><span>{t('Exporter')}</span></button><button onClick={()=>{onDelete(selected);setSelected([]);setSelecting(false);}}><Trash2 size={19}/><span>{t('Supprimer')}</span></button><button aria-label={t('Fermer la sélection')} onClick={()=>{setSelected([]);setSelecting(false);setMoving(false);}}><X size={19}/></button></div>:null}
   <SortableContext items={visible.map(sticker=>stickerKey(sticker.id))} strategy={rectSortingStrategy}><StickerDropArea label={t('Tous les stickers')} entityId={folderId??'all'}><div className="collection-grid">{visible.map(sticker=><SortableSticker key={sticker.id} sticker={sticker} selecting={selecting} selected={selected.includes(sticker.id)} disabled={disabled} onOpen={()=>selecting?toggle(sticker.id):onOpen(sticker.id)} onSelect={()=>{setSelecting(true);toggle(sticker.id);}} onFavorite={()=>onFavorite(sticker.id)} reduceMotion={reduceMotion}/>)}{visible.length?<button className="add-tile" aria-label={t('Créer un nouveau sticker')} onClick={()=>onCreate(folderId??'')}><Plus size={24}/></button>:null}</div>{!visible.length?<div className="library-empty"><div><FolderOpen size={34}/></div><h3>{t(query?'Aucun résultat':folderId?'Cette collection est vide':'Collection vide')}</h3><button className="button primary" onClick={()=>query?setQuery(''):fileInput.current?.click()}><ImagePlus size={18}/>{t(query?'Effacer la recherche':'Importer des médias')}</button><button className="quiet-button" onClick={()=>onCreate(folderId??'')}>{t('Créer un sticker')}</button></div>:null}</StickerDropArea></SortableContext>
   {mounted?createPortal(<DragOverlay dropAnimation={reduceMotion?null:{duration:160,easing:'ease-out'}} zIndex={100}>{drag?<div className={`library-drag-ghost ${drag.kind==='folder'?'is-folder':''}`}>{draggedSticker?<Media sticker={draggedSticker} active={false}/>:<Folder size={32}/>}<strong>{dragIds.length>1?t('Sélection : {count}',{count:dragIds.length}):drag.label}</strong></div>:null}</DragOverlay>,document.body):null}
  </DndContext>

  {external?<div className="library-external-hint" role="status"><Upload size={28}/>{t('Dépose tes médias ici')}</div>:null}
 </section>;
}

function FolderTarget({label,count,selected,onOpen,disabled}:{label:string;count:number;selected:boolean;onOpen:()=>void;disabled:boolean}){
 const {setNodeRef,isOver}=useDroppable({id:'target:unfiled',data:{kind:'target',entityId:'',label} satisfies DragData,disabled});
 return <button ref={setNodeRef} className={`${selected?'selected':''} ${isOver?'is-drop-target':''}`} aria-pressed={selected} onClick={onOpen}><Inbox size={15}/>{label}<small>{count}</small></button>;
}
function FolderTile({folder,count,selected,disabled,onOpen,onEdit}:{folder:CollectionFolder;count:number;selected:boolean;disabled:boolean;onOpen:()=>void;onEdit:()=>void}){
 const {t,reduceMotion}=usePreferences();
 const {setNodeRef,setActivatorNodeRef,attributes,listeners,transform,transition,isDragging,isOver}=useSortable({id:folderKey(folder.id),data:{kind:'folder',entityId:folder.id,label:folder.name} satisfies DragData,disabled,transition:reduceMotion?null:undefined});
 return <div ref={setNodeRef} className={`folder-tile ${selected?'selected':''} ${isOver?'is-drop-target':''}`} style={{transform:CSS.Transform.toString(transform),transition,opacity:isDragging ? .35 : 1,'--folder-color':folder.color} as CSSProperties}><button className="folder-open" {...listeners} aria-label={t('Ouvrir la collection {name}',{name:folder.name})} aria-pressed={selected} onClick={onOpen}><Folder size={23} fill={folder.color}/><strong>{folder.name}</strong><small>{count}</small></button><button ref={setActivatorNodeRef} {...attributes} {...listeners} className="folder-grip" aria-label={t('Réorganiser {name}',{name:folder.name})}><GripVertical size={16}/></button><button className="folder-edit" aria-label={t('Modifier la collection {name}',{name:folder.name})} onClick={onEdit}><MoreHorizontal size={18}/></button></div>;
}
function SortableSticker({sticker,selected,selecting,disabled,onOpen,onSelect,onFavorite,reduceMotion}:{sticker:Sticker;selected:boolean;selecting:boolean;disabled:boolean;onOpen:()=>void;onSelect:()=>void;onFavorite:()=>void;reduceMotion:boolean}){
 const {t}=usePreferences();
 const {setNodeRef,setActivatorNodeRef,attributes,listeners,transform,transition,isDragging,isOver}=useSortable({id:stickerKey(sticker.id),data:{kind:'sticker',entityId:sticker.id,label:sticker.name} satisfies DragData,disabled,transition:reduceMotion?null:undefined});
 return <article ref={setNodeRef} className={`sticker-card library-sticker ${selected?'selected':''} ${isOver?'library-sort-over':''}`} style={{transform:CSS.Transform.toString(transform),transition,opacity:isDragging ? .3 : 1}}>
  <button className="card-media" {...listeners} onClick={onOpen} aria-label={t(selecting?'Sélectionner {name}':'Ouvrir {name}',{name:sticker.name})} aria-pressed={selecting?selected:undefined}><Media sticker={sticker}/>{sticker.kind==='animated'?<span className="card-animation"><Play size={8} fill="currentColor"/></span>:null}</button>
  <button className="library-drag-handle" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={t('Déplacer {name}',{name:sticker.name})}><GripVertical size={17}/></button>
  {selecting?<button className={`library-select ${selected?'checked':''}`} onClick={onSelect} aria-label={t('Sélectionner {name}',{name:sticker.name})} aria-pressed={selected}>{selected?<Check size={16}/>:<span/>}</button>:<button className={`card-favorite ${sticker.favorite?'favorited':''}`} aria-label={t(sticker.favorite?'Retirer {name} des favoris':'Ajouter {name} aux favoris',{name:sticker.name})} onClick={onFavorite}><Heart size={14} fill={sticker.favorite?'currentColor':'none'}/></button>}
  <button className="card-title" onClick={onOpen}>{sticker.name}</button>
 </article>;
}
function StickerDropArea({children,label,entityId}:{children:ReactNode;label:string;entityId:string}){
 const {setNodeRef,isOver}=useDroppable({id:`tail:${entityId}`,data:{kind:'tail',entityId,label} satisfies DragData});
 return <div ref={setNodeRef} className={`library-stickers ${isOver?'library-tail-over':''}`}>{children}</div>;
}
function FolderForm({folder,onSave,onCancel,onDelete}:{folder:CollectionFolder|null;onSave:(folder:CollectionFolder)=>void;onCancel:()=>void;onDelete?:()=>void}){
 const {t}=usePreferences(),[name,setName]=useState(folder?.name??''),[color,setColor]=useState(folder?.color??folderColors[0]);
 return <form className="library-folder-form" onSubmit={event=>{event.preventDefault();if(name.trim())onSave({id:folder?.id??crypto.randomUUID(),name:name.trim(),color});}}><div className="tool-panel-heading"><strong>{t(folder?'Modifier la collection':'Nouvelle collection')}</strong><button className="small-icon" type="button" aria-label={t('Annuler')} onClick={onCancel}><X size={18}/></button></div><input className="field" autoFocus required maxLength={80} aria-label={t('Nom de la collection')} placeholder={t('Nom de la collection')} value={name} onChange={event=>setName(event.target.value)}/><div className="swatches" role="group" aria-label={t('Couleur de la collection')}>{folderColors.map(value=><button key={value} type="button" style={{backgroundColor:value,color:'#203b2d'}} aria-label={t('Couleur {color}',{color:value})} aria-pressed={color===value} onClick={()=>setColor(value)}>{color===value?<Check size={18}/>:null}</button>)}</div><button className="button primary" type="submit" disabled={!name.trim()}><Check size={18}/>{t(folder?'Enregistrer':'Créer une collection')}</button>{onDelete?<><p>{t('Les stickers seront conservés.')}</p><button className="quiet-button danger" type="button" onClick={onDelete}><Trash2 size={16}/>{t('Supprimer la collection')}</button></>:null}</form>;
}
