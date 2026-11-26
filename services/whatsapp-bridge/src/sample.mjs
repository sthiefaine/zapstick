import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { LIMITS, LOCALES } from './config.mjs';
import { validateMedia } from './media.mjs';

export function sampleArguments(args) {
  const result = { locale: 'fr' };
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!['--visual', '--sound', '--locale'].includes(key) || typeof value !== 'string' || Object.hasOwn(result, key.slice(2)) && key !== '--locale') throw new Error('invalid_arguments');
    result[key.slice(2)] = value;
  }
  if (!result.visual || !path.isAbsolute(result.visual) || result.sound && !path.isAbsolute(result.sound) || !LOCALES.has(result.locale)) throw new Error('invalid_arguments');
  return result;
}

function localFile(filename, maximum) {
  const info = statSync(filename);
  if (!info.isFile() || info.size <= 0 || info.size > maximum) throw new Error('invalid_local_file');
  const buffer = readFileSync(filename);
  if (buffer.length > maximum) throw new Error('invalid_local_file');
  return buffer;
}

export async function createSample({ args, env = process.env, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr, fetchImpl = fetch }) {
  // Codes are bearer capabilities. They may only be shown in an explicit interactive admin session.
  if (!stdin.isTTY || !stdout.isTTY || !stderr.isTTY) throw new Error('interactive_admin_terminal_required');
  const parsed = sampleArguments(args), token = env.WHATSAPP_BRIDGE_TOKEN;
  const port = Number(env.PORT || 3001);
  if (typeof token !== 'string' || token.length < 32 || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid_service_configuration');
  const visual = localFile(parsed.visual, 500 * 1024), sound = parsed.sound ? localFile(parsed.sound, Math.ceil(2.4 * 1024 * 1024)) : undefined;
  validateMedia({ visual, sound });
  const id = randomBytes(16).toString('base64url'), receipt = randomBytes(32).toString('base64url');
  const form = new FormData(); form.set('manifest', JSON.stringify({ version: 1, id, locale: parsed.locale }));
  form.set('visual', new Blob([visual], { type: 'image/webp' }), 'visual.webp');
  if (sound) form.set('sound', new Blob([sound], { type: 'audio/wav' }), 'sound.wav');
  if (visual.length + (sound?.length || 0) + LIMITS.manifestBytes > LIMITS.bodyBytes) throw new Error('too_large');
  const response = await fetchImpl(`http://127.0.0.1:${port}/internal/v1/transfers`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'x-transfer-receipt': receipt }, body: form, signal: AbortSignal.timeout(25_000), redirect: 'error' });
  const body = await response.json();
  if (!response.ok || body.id !== id || typeof body.claimCode !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(body.claimCode) || typeof body.waUrl !== 'string' || !/^https:\/\/wa\.me\/[1-9][0-9]{7,14}\?text=ZAP%20[A-Za-z0-9_-]{22}$/.test(body.waUrl)) throw new Error('sample_unavailable');
  stdout.write(`Code temporaire (10 minutes maximum) : ZAP ${body.claimCode}\n${body.waUrl}\nEnvoie ce message depuis le compte Android récepteur. Aucun sticker n’est envoyé automatiquement.\n`);
  return { id, expiresAt: body.expiresAt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createSample({ args: process.argv.slice(2) }).catch(error => {
    const known = ['interactive_admin_terminal_required', 'invalid_arguments', 'invalid_service_configuration', 'invalid_local_file', 'too_large'];
    process.stderr.write(`${known.includes(error?.message) ? error.message : 'sample_unavailable'}\n`); process.exitCode = 1;
  });
}
