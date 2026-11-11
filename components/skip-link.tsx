'use client';

import {useEffect} from 'react';
import {usePreferences} from '@/components/preferences-provider';
import {SKIP_LABEL} from '@/lib/site-metadata';

export function SkipLink(){const {locale}=usePreferences();return <a className="skip-link" href="#main-content">{SKIP_LABEL[locale]}</a>;}

// App Router can stream fresh metadata after the locale changes. Keep the
// browser chrome consistent with an explicit appearance preference, even when
// its new tags arrive after the provider's first effect has already run.
export function ThemeHeadSync(){
 const {theme,locale}=usePreferences();
 useEffect(()=>{
  const sync=()=>{
   const dark=theme==='dark'||theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches;
   const content=dark?'#181329':'#fff7e8';
   for(const meta of document.querySelectorAll('meta[name="theme-color"]')){
    if(meta.hasAttribute('media'))meta.removeAttribute('media');
    if(meta.getAttribute('content')!==content)meta.setAttribute('content',content);
   }
  };
  sync();const observer=new MutationObserver(sync);
  // Attribute changes made by sync are intentionally not observed.
  observer.observe(document.head,{childList:true,subtree:true});
  return()=>observer.disconnect();
 },[theme,locale]);
 return null;
}
