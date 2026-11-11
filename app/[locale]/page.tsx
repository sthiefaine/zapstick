import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import Home from '@/app/page';
import {normalizeLocale} from '@/lib/i18n/config';
import {applicationSchema,jsonLd,pageMetadata} from '@/lib/site-metadata';
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {locale:input}=await params,locale=normalizeLocale(input);if(!locale)notFound();return pageMetadata(locale);}
export default async function LocalizedHome({params}:Props){const {locale:input}=await params,locale=normalizeLocale(input);if(!locale)notFound();return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(applicationSchema(locale))}}/><Home/></>;}
