import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const serviceDir = new URL('../', import.meta.url);
const guardUrl = new URL('../src/private-console.mjs', import.meta.url).href;
const transportUrl = new URL('../src/transport.mjs', import.meta.url).href;

test('the real libsignal session lifecycle cannot log private material through the vendor console', () => {
  // Keep the process-wide policy out of the test runner. Import the actual
  // dependency graph without constructing a socket or opening a session store.
  const script = `
    import {createRequire} from 'node:module';
    import {loadBaileysPrivately, protectPrivateConsole} from ${JSON.stringify(guardUrl)};
    const marker = 'private_key_sentinel_never_log';
    const first = await loadBaileysPrivately();
    protectPrivateConsole();
    const second = await loadBaileysPrivately();
    if (first !== second || !first.proto?.Message) throw new Error('Private loader failed.');
    for (const method of ['assert', 'clear', 'count', 'countReset', 'debug', 'dir', 'dirxml', 'error', 'group', 'groupCollapsed', 'groupEnd', 'info', 'log', 'profile', 'profileEnd', 'table', 'time', 'timeEnd', 'timeLog', 'timeStamp', 'trace', 'warn']) {
      console[method](false, marker, {privKey: marker});
    }
    const require = createRequire(new URL('./package.json', import.meta.url));
    const SessionRecord = require('libsignal/src/session_record.js');
    const record = new SessionRecord(), session = SessionRecord.createEntry();
    session.indexInfo = {closed: -1};
    session.currentRatchet = {ephemeralKeyPair: {privKey: Buffer.from(marker)}, rootKey: Buffer.from(marker)};
    record.closeSession(session); // Direct console.info with the session object.
    record.openSession(session);  // Direct console.info with the session object.
    record.closeSession(session);
    record.closeSession(session); // Direct console.warn with the session object.
    process.stderr.write('explicit_private_qr_marker\\n');
    process.stdout.write(JSON.stringify({loaded: true, lifecycle: true}) + '\\n');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serviceDir, encoding: 'utf8', timeout: 20_000,
    env: {...process.env, NODE_NO_WARNINGS: '1'}, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '{"loaded":true,"lifecycle":true}');
  assert.equal(result.stderr, 'explicit_private_qr_marker\n');
  for (const output of [result.stdout, result.stderr]) {
    assert.ok(!output.includes('private_key_sentinel_never_log'));
    assert.ok(!output.includes('privKey'));
    assert.ok(!output.includes('rootKey'));
  }
});

test('the default transport loader installs the policy before loading real dependencies', () => {
  const script = `
    import {createWhatsAppTransport} from ${JSON.stringify(transportUrl)};
    let reads = 0, closed = false;
    const transport = createWhatsAppTransport({
      authStoreFactory() {
        reads++;
        // Registered=false stops before construction of any WhatsApp socket.
        return {state: {creds: {registered: false}}, close() {closed = true;}};
      },
    });
    await transport.connect();
    if (transport.getState() !== 'needs_pairing' || reads !== 1) throw new Error('Unexpected transport state.');
    console.info('default_loader_private_key_sentinel', {privKey: 'default_loader_private_key_sentinel'});
    await transport.close();
    if (!closed) throw new Error('Private auth fixture was not closed.');
    process.stdout.write('protected_default_loader_without_socket\\n');
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: serviceDir, encoding: 'utf8', timeout: 20_000,
    env: {...process.env, NODE_NO_WARNINGS: '1'}, stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'protected_default_loader_without_socket\n');
  assert.equal(result.stderr, '');
});
