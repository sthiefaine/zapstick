import translations from './translations.json';
import type {Locale} from './config';
import {privacyTranslations} from '../privacy/translations';
export type TranslationParams = Record<string,string|number>;
export const UI_TRANSLATIONS: Record<Locale, Record<string,string>> = translations;
export function translate(locale:Locale, source:string, params?:TranslationParams):string {
 const template=UI_TRANSLATIONS[locale]?.[source]??privacyTranslations[locale]?.[source]??source;
 return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(match,key)=>params&&Object.prototype.hasOwnProperty.call(params,key)?String(params[key]):match);
}
