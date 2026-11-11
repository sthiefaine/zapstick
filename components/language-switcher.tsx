'use client';

import {ChevronDown} from 'lucide-react';
import {usePreferences} from '@/components/preferences-provider';
import {LOCALE_FLAGS,LOCALE_NAMES,SUPPORTED_LOCALES,type Locale} from '@/lib/i18n/config';

export function LanguageSwitcher({disabled=false}:{disabled?:boolean}){
 const {locale,t,setLocale}=usePreferences();
 return <label className="header-language" title={t('Choisir la langue')}>
  <span aria-hidden="true"><span className="language-flag">{LOCALE_FLAGS[locale]}</span><ChevronDown size={13}/></span>
  <select aria-label={t('Choisir la langue')} value={locale} disabled={disabled} onChange={e=>setLocale(e.target.value as Locale)}>
   {SUPPORTED_LOCALES.map(value=><option key={value} value={value} lang={value}>{LOCALE_FLAGS[value]} {LOCALE_NAMES[value]}</option>)}
  </select>
 </label>;
}
