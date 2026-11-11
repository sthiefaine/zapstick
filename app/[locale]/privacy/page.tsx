import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {normalizeLocale} from '@/lib/i18n/config';
import {pageMetadata} from '@/lib/site-metadata';
import {PrivacyDocument} from '@/components/zapstick/privacy-document';
type Props={params:Promise<{locale:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{const {locale:input}=await params,locale=normalizeLocale(input);if(!locale)notFound();return pageMetadata(locale,'privacy');}
export default async function PrivacyPage({params}:Props){const {locale}=await params;if(!normalizeLocale(locale))notFound();return <main id="main-content" tabIndex={-1}><PrivacyDocument kind="privacy"/></main>;}
