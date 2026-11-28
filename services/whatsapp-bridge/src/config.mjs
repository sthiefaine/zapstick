import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';

export const LIMITS = Object.freeze({ bodyBytes: 4 * 1024 * 1024, manifestBytes: 2048, ttlMs: 10 * 60_000, retentionMs: 24 * 60 * 60_000, maxJobs: 20, maxBytes: 100 * 1024 * 1024, reservationBytes: 5 * 1024 * 1024, maxUploads: 2, uploadTimeoutMs: 20_000 });
export const LOCALES = new Set(['fr', 'en', 'pt-BR', 'es', 'de', 'zh-CN', 'ja', 'ru']);

export class BridgeError extends Error {
  constructor(code, statusCode = 400) { super(code); this.name = 'BridgeError'; this.code = code; this.statusCode = statusCode; }
}

export function capability(value, bytes) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && value.length === Math.ceil(bytes * 8 / 6) && Buffer.from(value, 'base64url').length === bytes && Buffer.from(value, 'base64url').toString('base64url') === value;
}

export function equalSecret(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function loadConfig(env = process.env) {
  const enabled = env.WHATSAPP_BRIDGE_ENABLED === 'true';
  const serviceToken = env.WHATSAPP_BRIDGE_TOKEN || '';
  const transferKey = env.WHATSAPP_TRANSFER_KEY || '';
  const authKey = env.WHATSAPP_AUTH_KEY || '';
  const botNumber = env.WHATSAPP_BOT_NUMBER || '';
  if (serviceToken.length < 32 || !capability(transferKey, 32)) throw new BridgeError('invalid_service_configuration', 500);
  if (enabled && (!capability(authKey, 32) || !/^[1-9][0-9]{7,14}$/.test(botNumber))) throw new BridgeError('invalid_account_configuration', 500);
  let siteUrl;
  if (env.WHATSAPP_SITE_URL) {
    try { const url = new URL(env.WHATSAPP_SITE_URL); if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error(); siteUrl = url.origin; }
    catch { throw new BridgeError('invalid_site_configuration', 500); }
  }
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new BridgeError('invalid_port', 500);
  return {
    enabled, paused: env.WHATSAPP_BRIDGE_PAUSED === 'true', siteUrl, serviceToken, transferKey: Buffer.from(transferKey, 'base64url'), authKey,
    soundEnabled: enabled && env.WHATSAPP_SOUND_ENABLED === 'true', botNumber,
    dataDir: path.resolve(env.WHATSAPP_DATA_DIR || '/data/transfers'), authDir: path.resolve(env.WHATSAPP_AUTH_DIR || '/data/auth'),
    host: env.HOSTNAME || '0.0.0.0', port,
  };
}
