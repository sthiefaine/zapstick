'use client';

import {createContext,useCallback,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {Trash2} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import './action-buttons.css';

type Request={title?:string;description:string};
type Confirm=(request:Request)=>Promise<boolean>;
const Context=createContext<Confirm|null>(null);

export function ConfirmActionProvider({children}:{children:ReactNode}){
 const {t}=usePreferences(),id=useId(),dialog=useRef<HTMLDialogElement>(null),settle=useRef<((value:boolean)=>void)|null>(null);
 const [request,setRequest]=useState<Request|null>(null);
 const confirm=useCallback<Confirm>(value=>{
  if(settle.current)return Promise.resolve(false);
  return new Promise(resolve=>{settle.current=resolve;setRequest(value);});
 },[]);
 const finish=useCallback((value:boolean)=>{const resolve=settle.current;settle.current=null;dialog.current?.close();setRequest(null);resolve?.(value);},[]);
 useEffect(()=>{if(request&&!dialog.current?.open)dialog.current?.showModal();},[request]);
 useEffect(()=>()=>{settle.current?.(false);settle.current=null;},[]);
 return <Context.Provider value={confirm}>{children}<dialog ref={dialog} className="confirm-action-dialog" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event=>{event.preventDefault();finish(false);}} onClose={()=>{if(settle.current)finish(false);}}>
  {request?<><span className="confirm-action-icon" aria-hidden="true"><Trash2 size={25}/></span><h2 id={`${id}-title`}>{request.title??t('Confirmer la suppression')}</h2><p id={`${id}-description`}>{request.description}</p><div className="confirm-action-buttons"><button type="button" className="button secondary" autoFocus onClick={()=>finish(false)}>{t('Annuler')}</button><button type="button" data-action="delete" onClick={()=>finish(true)}><Trash2 size={18}/>{t('Supprimer')}</button></div></>:null}
 </dialog></Context.Provider>;
}
export function useConfirmAction(){const confirm=useContext(Context);if(!confirm)throw new Error('Missing confirmation provider.');return confirm;}
