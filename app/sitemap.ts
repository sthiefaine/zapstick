import type {MetadataRoute} from 'next';
import {SUPPORTED_LOCALES} from '@/lib/i18n/config';
import {isSiteIndexable,languageAlternates,localizedPath,siteOrigin,type PublicPage} from '@/lib/site-metadata';
export const dynamic='force-dynamic';
export default function sitemap():MetadataRoute.Sitemap{
 if(!isSiteIndexable())return [];
 return (['home','privacy','legal'] as PublicPage[]).flatMap(kind=>SUPPORTED_LOCALES.map(locale=>({url:`${siteOrigin()}${localizedPath(locale,kind)}`,changeFrequency:kind==='home'?'monthly' as const:'yearly' as const,priority:kind==='home'?.8:.2,alternates:{languages:languageAlternates(kind)}})));
}
