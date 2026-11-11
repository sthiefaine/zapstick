import type {Locale} from '@/lib/i18n/config';

export type ZapstickSharePayload = {title: string; text: string; url: string};
export type ShareAdapters = {
  share?: (payload: ZapstickSharePayload) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
};
export type ShareResult = {status: 'shared' | 'cancelled' | 'copied' | 'manual'; url: string};

function publicHttpsOrigin(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || host.includes(':') || /^(?:\d+\.){3}\d+$/.test(host) || host === 'localhost' || /\.(?:localhost|local|internal|test|invalid|example|lan|home)$/.test(host)) return null;
    return url.origin;
  } catch { return null; }
}

/** The configured public deployment takes precedence; development uses its real
 * current origin, never an invented production domain or a fixed local port. */
export function zapstickShareUrl({locale, origin, configuredUrl}: {locale: Locale; origin: string; configuredUrl?: string}): string {
  const current = new URL(origin);
  if (!['https:', 'http:'].includes(current.protocol) || current.username || current.password) throw new TypeError('Invalid site origin');
  return `${publicHttpsOrigin(configuredUrl) ?? current.origin}/${locale}`;
}

/** Invoke from a click only. This helper makes no requests and reads no clipboard
 * content or permissions. A dismissed share sheet never triggers a second action. */
export async function shareZapstick(payload: ZapstickSharePayload, adapters: ShareAdapters): Promise<ShareResult> {
  if (adapters.share) {
    try { await adapters.share(payload); return {status: 'shared', url: payload.url}; }
    catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return {status: 'cancelled', url: payload.url};
    }
  }
  if (adapters.writeText) {
    try { await adapters.writeText(payload.url); return {status: 'copied', url: payload.url}; }
    catch { /* A selectable link is the final fallback when writing is unavailable. */ }
  }
  return {status: 'manual', url: payload.url};
}
