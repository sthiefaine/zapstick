import {createInterface} from 'node:readline/promises';
import {pathToFileURL} from 'node:url';
import {openAuthStore} from './auth.mjs';
import {loadBaileysPrivately} from './private-console.mjs';
import {TransportSafety} from './transport-safety.mjs';

/** Offline administration under the same exclusive session lock as the bot.
 * This command never creates a WhatsApp socket or prints account credentials. */
export async function manageSafety({command = 'status', env = process.env, input = process.stdin, output = process.stdout} = {}) {
  if (!['status', 'pause', 'resume'].includes(command)) throw new Error('Use: npm run safety -- status|pause|resume');
  if (!env.WHATSAPP_AUTH_DIR || !env.WHATSAPP_AUTH_KEY) throw new Error('Configure the private auth directory and key. Stop the bridge first.');
  if (command === 'resume') {
    if (!input.isTTY || !output.isTTY) throw new Error('Resuming requires a private interactive administrator terminal.');
    if (env.WHATSAPP_BRIDGE_PAUSED === 'true') throw new Error('Remove the operator pause setting before explicitly resuming.');
    const prompt = createInterface({input, output});
    let answer;
    try { answer = await prompt.question('Do not resume a blocked account. After reviewing the account status and resolving the issue, resume sending? [yes/N] '); }
    finally { prompt.close(); }
    if (answer.trim().toLowerCase() !== 'yes') return;
  }
  const baileys = await loadBaileysPrivately();
  const store = openAuthStore({authDir: env.WHATSAPP_AUTH_DIR, authKey: env.WHATSAPP_AUTH_KEY,
    initAuthCreds: baileys.initAuthCreds, BufferJSON: baileys.BufferJSON, proto: baileys.proto});
  try {
    const safety = new TransportSafety({read: () => store.readSafetyState(), write: value => store.saveSafetyState(value)});
    if (command === 'pause') safety.pause('operator');
    else if (command === 'resume') safety.resume();
    output.write(JSON.stringify(safety.status()) + '\n');
  } finally { store.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  manageSafety({command: process.argv[2]}).catch(() => {
    process.stderr.write('Offline safety command failed. Check the command, private configuration and session lock; stop the bridge first. Resume requires an interactive terminal and no operator pause setting.\n');
    process.exitCode = 1;
  });
}
