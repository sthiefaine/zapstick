import type {Metadata,Viewport} from 'next';
import {headers} from 'next/headers';
import {PreferencesProvider} from '@/components/preferences-provider';
import {SkipLink,ThemeHeadSync} from '@/components/skip-link';
import {normalizeLocale,PREFERENCES_INIT_SCRIPT} from '@/lib/i18n/config';
import {pageMetadata,NOSCRIPT_LABEL} from '@/lib/site-metadata';
import './globals.css';

export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:[{media:'(prefers-color-scheme: light)',color:'#f4f8ed'},{media:'(prefers-color-scheme: dark)',color:'#122019'}]};
export async function generateMetadata():Promise<Metadata>{const requestHeaders=await headers();return pageMetadata(normalizeLocale(requestHeaders.get('x-zapstick-locale')??'')??'fr');}
export default async function RootLayout({children}:Readonly<{children:React.ReactNode}>){
 const requestHeaders=await headers(),locale=normalizeLocale(requestHeaders.get('x-zapstick-locale')??'')??'fr';
 return <html lang={locale} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:PREFERENCES_INIT_SCRIPT}}/></head><body><PreferencesProvider locale={locale}><SkipLink/><ThemeHeadSync/>{children}</PreferencesProvider><noscript><p>{NOSCRIPT_LABEL[locale]}</p></noscript></body></html>;
}
