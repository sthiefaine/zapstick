'use client';

import {useState} from 'react';
import {LoaderCircle,Trash2,X} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';

export function PrivacySettings({onClearData,privacyHref,legalHref}:{onClearData:()=>Promise<void>;privacyHref?:string;legalHref?:string}){
  const {locale,t}=usePreferences();
  const [confirming,setConfirming]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  async function clear(){
    if(working)return;
    setWorking(true);setError('');setDone(false);
    try{await onClearData();setDone(true);setConfirming(false);}
    catch(err){setError(err instanceof Error?t(err.message):t('Impossible d’effacer les données. Réessaie.'));}
    finally{setWorking(false);}
  }
  return <section className="settings-group privacy-settings" aria-labelledby="privacy-settings-title">
    <h2 id="privacy-settings-title">{t('Confidentialité et données')}</h2>
    <div className="privacy-document-links"><a href={privacyHref??`/${locale}/privacy`}>{t('Confidentialité')}<span aria-hidden="true">→</span></a><a href={legalHref??`/${locale}/legal`}>{t('Mentions légales')}<span aria-hidden="true">→</span></a></div>
    <button className="settings-row danger" type="button" aria-expanded={confirming} aria-controls="clear-local-confirm" disabled={working} onClick={()=>{setConfirming(p=>!p);setError('');setDone(false);}}><Trash2 size={19} aria-hidden="true"/><span>{t('Effacer les données de cet appareil')}</span></button>
    {confirming?<div id="clear-local-confirm" className="restore-confirm privacy-clear-confirm">
      <h3>{t('Effacer la collection et les préférences ?')}</h3>
      <p>{t('Cette action supprime les médias, packs, favoris et préférences enregistrés par Zapstick dans ce navigateur. Les sauvegardes et fichiers déjà téléchargés ne sont pas supprimés. Cette action ne peut pas être annulée.')}</p>
      <div className="two-actions"><button className="button secondary" type="button" disabled={working} onClick={()=>setConfirming(false)}><X size={16} aria-hidden="true"/>{t('Annuler')}</button><button className="button destructive" type="button" disabled={working} onClick={clear}>{working?<LoaderCircle className="spin" size={17} aria-hidden="true"/>:<Trash2 size={17} aria-hidden="true"/>}{working?t('Effacement…'):t('Tout effacer')}</button></div>
    </div>:null}
    {error?<p className="inline-error" role="alert">{error}</p>:null}
    {done?<p className="privacy-cleared" role="status">{t('Les données locales ont été effacées.')}</p>:null}
  </section>;
}
