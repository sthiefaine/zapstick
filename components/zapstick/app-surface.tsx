'use client';
import type {ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {normalizeLocale} from '@/lib/i18n/config';
import ZapstickApp from './zapstick-app';

/** This sibling sits above changing locale segments, preserving editing state. */
export function AppSurface({children}:{children:ReactNode}){
 const pathname=usePathname()??'/',parts=pathname.split('/').filter(Boolean);
 const isApp=parts.length===0||parts.length===1&&!!normalizeLocale(parts[0]);
 return <>{isApp?<ZapstickApp/>:null}{children}</>;
}
