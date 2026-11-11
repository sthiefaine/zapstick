'use client';

import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {DEFAULT_LOCALE,LOCALE_COOKIE,THEME_COOKIE,PREFERENCES_STORAGE_KEY,isThemePreference,localizedPath,normalizeLocale,type Locale,type ThemePreference} from '@/lib/i18n/config';
import {translate} from '@/lib/i18n/messages';

type Translator = (source:string,params?:Record<string,string|number>)=>string;
type Preferences = {locale:Locale;t:Translator;theme:ThemePreference;setTheme:(theme:ThemePreference)=>void;setLocale:(locale:Locale)=>void;resetPreferences:()=>void;reduceMotion:boolean;setReduceMotion:(value:boolean)=>void};
const PreferencesContext=createContext<Preferences|null>(null);

// Runs before hydration. Only essential appearance preferences are read; no
// analytics, fingerprinting, or external request is involved.

function writeCookie(key:string,value:string){try{document.cookie=`${key}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;}catch{/* In-memory preferences still work when persistent storage is blocked. */}}
function persist(theme:ThemePreference,locale:Locale,reduceMotion:boolean|null){try{localStorage.setItem(PREFERENCES_STORAGE_KEY,JSON.stringify({version:1,theme,locale,reduceMotion}));}catch{}writeCookie(THEME_COOKIE,theme);writeCookie(LOCALE_COOKIE,locale);}
function applyTheme(theme:ThemePreference){const resolved=theme==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;for(const color of document.querySelectorAll('meta[name="theme-color"]')){color.removeAttribute('media');color.setAttribute('content',resolved==='dark'?'#122019':'#f4f8ed');}}
export function PreferencesProvider({locale:initialLocale=DEFAULT_LOCALE,children}:{locale?:Locale;children:ReactNode}){
 const pathname=usePathname()??'/',router=useRouter();
 const routeLocale=normalizeLocale(pathname.split('/').filter(Boolean)[0]??'');
 const locale=routeLocale??initialLocale;
 const [theme,setThemeState]=useState<ThemePreference>('system'),[initialized,setInitialized]=useState(false),[motionOverride,setMotionOverride]=useState<boolean|null>(null),[systemReduced,setSystemReduced]=useState(false);
 const reduceMotion=motionOverride??systemReduced;
 useEffect(()=>{let saved:unknown;try{const stored=JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)||'{}');saved=stored.theme;if(typeof stored.reduceMotion==='boolean')setMotionOverride(stored.reduceMotion);}catch{}const preference=isThemePreference(saved)?saved:'system';setThemeState(preference);applyTheme(preference);setInitialized(true);},[]);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setSystemReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 useEffect(()=>{document.documentElement.dataset.reducedMotion=String(reduceMotion);},[reduceMotion]);
 useEffect(()=>{document.documentElement.lang=locale;document.documentElement.dir='ltr';},[locale]);
 useEffect(()=>{if(!initialized)return;applyTheme(theme);const media=window.matchMedia('(prefers-color-scheme: dark)');const update=()=>{if(theme==='system')applyTheme(theme);};media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[theme,initialized,locale]);
 const setTheme=useCallback((next:ThemePreference)=>{if(!isThemePreference(next))return;setThemeState(next);applyTheme(next);persist(next,locale,motionOverride);},[locale,motionOverride]);
 const setLocale=useCallback((next:Locale)=>{const normalized=normalizeLocale(next);if(!normalized||normalized===locale)return;persist(theme,normalized,motionOverride);router.push(`${localizedPath(pathname,normalized)}${window.location.search}${window.location.hash}`);},[locale,pathname,router,theme,motionOverride]);
 const resetPreferences=useCallback(()=>{try{localStorage.removeItem(PREFERENCES_STORAGE_KEY);}catch{}for(const key of[LOCALE_COOKIE,THEME_COOKIE])try{document.cookie=`${key}=; Path=/; Max-Age=0; SameSite=Lax`;}catch{}setThemeState('system');setMotionOverride(null);applyTheme('system');},[]);
 const setReduceMotion=useCallback((value:boolean)=>{setMotionOverride(value);persist(theme,locale,value);},[theme,locale]);
 const t=useCallback<Translator>((source,params)=>translate(locale,source,params),[locale]);
 const value=useMemo(()=>({locale,t,theme,setTheme,setLocale,resetPreferences,reduceMotion,setReduceMotion}),[locale,t,theme,setTheme,setLocale,resetPreferences,reduceMotion,setReduceMotion]);
 return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
export function usePreferences():Preferences{
 const context=useContext(PreferencesContext);
 if(!context)throw new Error('Zapstick preferences require PreferencesProvider.');
 return context;
}
