// Baileys' logger does not cover libsignal's direct console calls: opening or
// closing a Signal session can print the session object, including private keys.
// This headless process uses process.stdout/stderr.write for its own fixed
// diagnostic codes and for the explicitly requested private association QR.
const INSTALLED = Symbol.for('zapstick.private-console.v1');
const OUTPUT_METHODS = [
  'assert', 'clear', 'count', 'countReset', 'debug', 'dir', 'dirxml', 'error',
  'group', 'groupCollapsed', 'groupEnd', 'info', 'log', 'profile', 'profileEnd',
  'table', 'time', 'timeEnd', 'timeLog', 'timeStamp', 'trace', 'warn',
];

/** Default-deny the global vendor console before importing the WhatsApp stack.
 * Deliberately process-wide: suppressing only the passed-in logger leaves
 * libsignal's global console.info/warn calls able to expose Signal material. */
export function protectPrivateConsole() {
  const target = globalThis.console;
  if (target[INSTALLED]) return;
  const silent = () => {};
  for (const method of OUTPUT_METHODS) target[method] = silent;
  Object.defineProperty(target, INSTALLED, {value: true});
}

export async function loadBaileysPrivately() {
  protectPrivateConsole();
  return import('@whiskeysockets/baileys');
}
