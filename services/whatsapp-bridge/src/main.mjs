import { loadConfig } from './config.mjs';
import { BridgeStore } from './store.mjs';
import { createBridgeServer } from './server.mjs';
import { BridgeWorker } from './worker.mjs';
import { encodeOpus } from './media.mjs';
import { createWhatsAppTransport } from './transport.mjs';

const config = loadConfig();
const store = new BridgeStore({ dir: config.dataDir, key: config.transferKey, botNumber: config.botNumber });
let worker;
const transport = config.enabled ? createWhatsAppTransport({ authDir: config.authDir, authKey: config.authKey, expectedNumber: config.botNumber, soundEnabled: config.soundEnabled,
  onClaim: event => { const claimed = store.claim(event); if (claimed) worker?.kick(); return claimed; },
  onReceipt: event => store.confirmReceipt(event),
}) : { isReady: () => false, close: async () => {}, getState: () => 'disabled' };
worker = new BridgeWorker({ store, transport, encodeOpus, enabled: config.enabled, soundEnabled: config.soundEnabled });
const app = createBridgeServer({ store, serviceToken: config.serviceToken, enabled: config.enabled, soundEnabled: config.soundEnabled,
  isReady: () => transport.isReady(), onWork: () => worker.kick(), onCancel: id => worker.cancel(id),
});
await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(config.port, config.host, resolve); });
worker.start();
if (config.enabled) transport.connect().catch(() => process.stderr.write('whatsapp_connection_unavailable\n'));
process.stdout.write('whatsapp_bridge_started\n');
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  const deadline = setTimeout(() => process.exit(1), 25_000); deadline.unref();
  try { const httpClosing = app.close(); await worker.close(); await transport.close(); await httpClosing; store.close(); }
  finally { clearTimeout(deadline); }
}
process.once('SIGTERM', stop); process.once('SIGINT', stop);
