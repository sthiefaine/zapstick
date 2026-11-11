import type {MetadataRoute} from 'next';
import {isSiteIndexable,siteOrigin} from '@/lib/site-metadata';
export const dynamic='force-dynamic';
export default function robots():MetadataRoute.Robots{
 // Crawlers must be allowed to read the noindex page/header. robots.txt is
 // never an access-control mechanism for a private installation.
 const origin=siteOrigin();
 return isSiteIndexable()?{rules:{userAgent:'*',allow:'/',disallow:['/api/','/_next/']},sitemap:`${origin}/sitemap.xml`,host:origin}:{rules:{userAgent:'*',allow:'/'}};
}
