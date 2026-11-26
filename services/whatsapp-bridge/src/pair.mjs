import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { createWhatsAppTransport } from './transport.mjs';

/** Run with `docker compose run --rm whatsapp-bridge npm run pair` in an
 * administrator's private interactive console after stopping the bridge:
 * this command takes the same exclusive auth lock as the regular service. */
export async function pairInPrivateTerminal({ env = process.env, input = process.stdin, output = process.stdout, errorOutput = process.stderr } = {}) {
  if (!input.isTTY || !output.isTTY || !errorOutput.isTTY) throw new Error('Association requires a private interactive administrator terminal.');
  if (!env.WHATSAPP_AUTH_DIR || !env.WHATSAPP_AUTH_KEY || !/^[1-9]\d{7,14}$/.test(env.WHATSAPP_BOT_NUMBER ?? '')) throw new Error('Configure the private session, key and dedicated bot number before association.');
  const prompt = createInterface({ input, output });
  let answer;
  try {
    answer = await prompt.question('Private console only. The next QR links this device to your WhatsApp Business account. Continue? [yes/N] ');
  } finally { prompt.close(); }
  if (answer.trim().toLowerCase() !== 'yes') return { paired: false };
  const { default: qr } = await import('qrcode-terminal');
  let transport, finish;
  const outcome = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  // A connection error can occur before connect() resolves. Keep that rejection
  // handled while preserving it for the awaited outcome below.
  outcome.catch(() => {});
  const timeout = setTimeout(() => finish.reject(new Error('Private association timed out. Run the command again.')), 3 * 60_000);
  const interrupted = () => finish.reject(new Error('Private association interrupted.'));
  process.once('SIGINT', interrupted);
  process.once('SIGTERM', interrupted);
  try {
    transport = createWhatsAppTransport({
      authDir: env.WHATSAPP_AUTH_DIR, authKey: env.WHATSAPP_AUTH_KEY, expectedNumber: env.WHATSAPP_BOT_NUMBER,
      allowPairing: true, soundEnabled: false,
      onQr(value) {
        qr.generate(value, { small: true }, rendered => errorOutput.write(`\n${rendered}\n`));
        output.write('In WhatsApp Business: Settings > Linked devices > Link a device.\n');
      },
      onState(state) {
        if (state === 'connected') finish.resolve({ paired: true });
        else if (['logged_out', 'wrong_account', 'error'].includes(state)) finish.reject(new Error('Association could not complete. Check the dedicated account on your phone.'));
      }
    });
    await transport.connect();
    const result = await outcome;
    output.write('WhatsApp device associated. Restart the private bridge service.\n');
    return result;
  } finally {
    clearTimeout(timeout);
    process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted);
    await transport?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  pairInPrivateTerminal().catch(() => {
    process.stderr.write('Private association failed. Check the terminal, configuration and account on your phone.\n');
    process.exitCode = 1;
  });
}
