import {NextResponse,type NextRequest} from 'next/server';
import {normalizeLocale,LOCALE_COOKIE} from '@/lib/i18n/config';
import {isSiteIndexable} from '@/lib/site-metadata';

// Keep the language of the server-rendered document tied to the URL. Incoming
// headers are overwritten rather than trusted as a language selection.
export function proxy(request:NextRequest){
 const path=request.nextUrl.pathname,segment=path.split('/')[1]??'',locale=normalizeLocale(segment)??(path==='/'?normalizeLocale(request.cookies.get(LOCALE_COOKIE)?.value??''):undefined)??'fr';
 if(segment&&normalizeLocale(segment)&&segment!==locale){const canonical=request.nextUrl.clone();canonical.pathname=path.replace(`/${segment}`,`/${locale}`);return NextResponse.redirect(canonical,308);}
 const headers=new Headers(request.headers);headers.set('x-zapstick-locale',locale);
 const response=NextResponse.next({request:{headers}});
 if(!isSiteIndexable())response.headers.set('X-Robots-Tag','noindex, nofollow');
 return response;
}
export const config={matcher:['/((?!_next/static|_next/image|assets/|favicon\\.svg|social-card\\.png|apple-touch-icon\\.png|manifest\\.webmanifest|api/health|robots\\.txt|sitemap\\.xml).*)']};
