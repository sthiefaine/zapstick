export const SUPPORTED_LOCALES = ['fr', 'en', 'pt-BR', 'es', 'de', 'zh-CN', 'ja', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type ThemePreference = 'light' | 'dark' | 'system';
export const DEFAULT_LOCALE: Locale = 'fr';
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français', en: 'English', 'pt-BR': 'Português (Brasil)', es: 'Español',
  de: 'Deutsch', 'zh-CN': '中文（简体）', ja: '日本語', ru: 'Русский',
};
export const LOCALE_FLAGS: Record<Locale, string> = {
  fr:'🇫🇷',en:'🇬🇧','pt-BR':'🇧🇷',es:'🇪🇸',de:'🇩🇪','zh-CN':'🇨🇳',ja:'🇯🇵',ru:'🇷🇺',
};
export function normalizeLocale(input: string): Locale | undefined {
  const value = input.trim().replace(/_/g, '-').toLowerCase();
  const exact = SUPPORTED_LOCALES.find(locale => locale.toLowerCase() === value);
  if (exact) return exact;
  const aliases: Record<string, Locale> = {ge:'de',jap:'ja',rus:'ru',mandarin:'zh-CN',pt:'pt-BR',zh:'zh-CN'};
  if (aliases[value]) return aliases[value];
  const base = value.split('-')[0];
  return aliases[base] ?? SUPPORTED_LOCALES.find(locale => locale.toLowerCase() === base);
}
export function localizedPath(pathname: string, locale: Locale): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] && normalizeLocale(parts[0])) parts.shift();
  return `/${locale}${parts.length ? `/${parts.join('/')}` : ''}`;
}
export const PREFERENCES_STORAGE_KEY = 'zapstick-preferences-v1';
export const LOCALE_COOKIE = 'zapstick-locale';
export const THEME_COOKIE = 'zapstick-theme';
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export const PREFERENCES_INIT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${PREFERENCES_STORAGE_KEY}')||'{}');var m=typeof p.reduceMotion==='boolean'?p.reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches;document.documentElement.dataset.reducedMotion=String(m);var v=p.theme;if(v!=='light'&&v!=='dark'&&v!=='system')v='system';var d=v==='dark'||(v==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';document.querySelectorAll('meta[name=\"theme-color\"]').forEach(function(x){x.removeAttribute('media');x.setAttribute('content',d?'#121212':'#fafafa');});}catch(e){var d=matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.style.colorScheme=d?'dark':'light';document.querySelectorAll('meta[name=\"theme-color\"]').forEach(function(x){x.removeAttribute('media');x.setAttribute('content',d?'#121212':'#fafafa');});}})();`;
