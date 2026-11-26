import http from 'node:http';
import { BridgeError, LIMITS, LOCALES, capability, equalSecret } from './config.mjs';
import { validateMedia as defaultValidator } from './media.mjs';

class Budget {
  constructor(capacity, perMinute, clock) { this.capacity = capacity; this.tokens = capacity; this.perMs = perMinute / 60_000; this.clock = clock; this.last = clock(); }
  take() { const now = this.clock(); this.tokens = Math.min(this.capacity, this.tokens + Math.max(0, now - this.last) * this.perMs); this.last = now; if (this.tokens < 1) return false; this.tokens--; return true; }
}

function json(request, response, statusCode, value) {
  if (response.destroyed || response.writableEnded) return;
  const body = JSON.stringify(value);
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(statusCode >= 400 ? { Connection: 'close' } : {}), ...([429, 503].includes(statusCode) ? { 'Retry-After': '5' } : {}) });
  response.end(body);
}

async function readBody(request, limit, timeoutMs) {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^[0-9]+$/.test(declared) || Number(declared) > limit)) throw new BridgeError('too_large', 413);
  return new Promise((resolve, reject) => {
    let total = 0; const chunks = [];
    const cleanup = () => { clearTimeout(timer); request.off('data', data); request.off('end', end); request.off('aborted', aborted); request.off('error', failed); };
    const failed = error => { cleanup(); request.pause(); reject(error); };
    const aborted = () => failed(new BridgeError('cancelled', 400));
    const data = chunk => { total += chunk.length; if (total > limit) failed(new BridgeError('too_large', 413)); else chunks.push(chunk); };
    const end = () => { cleanup(); resolve(Buffer.concat(chunks, total)); };
    const timer = setTimeout(() => failed(new BridgeError('timeout', 408)), timeoutMs); timer.unref();
    request.on('data', data); request.once('end', end); request.once('aborted', aborted); request.once('error', failed);
  });
}

async function multipart(bytes, contentType, validator) {
  if (typeof contentType !== 'string' || contentType.length > 200 || !/^multipart\/form-data;\s*boundary=(?:[A-Za-z0-9'()+_,.\/:=?-]{1,70}|"[A-Za-z0-9'()+_,.\/:=?-]{1,70}")$/i.test(contentType)) throw new BridgeError('invalid', 400);
  let form;
  try { form = await new Request('http://bridge.invalid/', { method: 'POST', headers: { 'Content-Type': contentType }, body: bytes }).formData(); }
  catch { throw new BridgeError('invalid', 400); }
  const entries = [...form.entries()], names = entries.map(([name]) => name);
  if (entries.length < 2 || entries.length > 3 || new Set(names).size !== names.length || names.some(name => !['manifest', 'visual', 'sound'].includes(name))) throw new BridgeError('invalid', 400);
  const manifest = form.get('manifest'), visual = form.get('visual'), sound = form.get('sound');
  if (typeof manifest !== 'string' || Buffer.byteLength(manifest) > LIMITS.manifestBytes || !(visual instanceof Blob) || sound !== null && !(sound instanceof Blob)) throw new BridgeError('invalid', 400);
  let parsed;
  try { parsed = JSON.parse(manifest); } catch { throw new BridgeError('invalid', 400); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== 1 || !capability(parsed.id, 16) || !LOCALES.has(parsed.locale) || Object.keys(parsed).some(key => !['version', 'id', 'locale'].includes(key))) throw new BridgeError('invalid', 400);
  const visualBytes = Buffer.from(await visual.arrayBuffer()), soundBytes = sound ? Buffer.from(await sound.arrayBuffer()) : undefined;
  let media;
  try { media = await validator({ visual: visualBytes, sound: soundBytes }); }
  catch (error) { if (error?.statusCode === 413) throw new BridgeError('too_large', 413); throw new BridgeError('invalid', 422); }
  return { id: parsed.id, locale: parsed.locale, visual: visualBytes, sound: soundBytes, media };
}

/** Private HTTP surface. No pairing, file download, recipient input or public QR route. */
export function createBridgeServer({ store, serviceToken, enabled = false, soundEnabled = false, isReady = () => false, validateMedia = defaultValidator, onWork = () => {}, onCancel = () => {}, clock = Date.now, limits = {} }) {
  const config = { ...LIMITS, ...limits };
  const creationBudget = new Budget(10, 10, clock), statusBudget = new Budget(60, 120, clock);
  let uploads = 0, closing = false;
  const server = http.createServer({ maxHeaderSize: 8192, headersTimeout: 10_000, requestTimeout: config.uploadTimeoutMs }, async (request, response) => {
    const pathname = request.url || '', method = request.method || 'GET';
    if (pathname === '/health/live' && method === 'GET') { json(request, response, closing ? 503 : 200, { live: !closing }); return; }
    if (!equalSecret(request.headers.authorization, `Bearer ${serviceToken}`)) { json(request, response, 401, { error: 'unauthorized' }); return; }
    if (closing) { json(request, response, 503, { error: 'unavailable' }); return; }
    if (pathname === '/internal/v1/status' && method === 'GET') {
      if (!statusBudget.take()) { json(request, response, 429, { error: 'busy' }); return; }
      try { json(request, response, 200, { enabled, ready: enabled && isReady() && store.capacity().available, soundEnabled: enabled && soundEnabled }); }
      catch { json(request, response, 503, { error: 'unavailable' }); }
      return;
    }
    const detail = /^\/internal\/v1\/transfers\/([A-Za-z0-9_-]{22})$/.exec(pathname);
    const create = pathname === '/internal/v1/transfers';
    if (!create && !detail) { json(request, response, 404, { error: 'not_found' }); return; }
    if (create && method !== 'POST' || detail && !['GET', 'DELETE'].includes(method)) { json(request, response, 405, { error: 'invalid' }); return; }
    const receipt = request.headers['x-transfer-receipt'];
    if (!capability(receipt, 32)) { json(request, response, 404, { error: 'not_found' }); return; }
    if (method !== 'POST' && (request.headers['transfer-encoding'] || Number(request.headers['content-length'] || 0) !== 0)) { json(request, response, 400, { error: 'invalid' }); return; }
    try {
      if (detail) {
        if (!statusBudget.take()) throw new BridgeError('busy', 429);
        const result = method === 'DELETE' ? store.cancel(detail[1], receipt) : store.get(detail[1], receipt);
        if (method === 'DELETE') onCancel(detail[1]);
        json(request, response, result.state === 'expired' ? 410 : 200, result); return;
      }
      if (!enabled || !isReady()) throw new BridgeError('unavailable', 503);
      if (uploads >= config.maxUploads || !creationBudget.take()) throw new BridgeError('busy', 429);
      uploads++;
      try {
        const bytes = await readBody(request, config.bodyBytes, config.uploadTimeoutMs);
        const payload = await multipart(bytes, request.headers['content-type'], validateMedia);
        if (payload.sound && !soundEnabled) throw new BridgeError('sound_unavailable', 422);
        if (request.aborted || response.destroyed) throw new BridgeError('cancelled', 400);
        const result = store.create({ ...payload, receipt });
        json(request, response, result.created ? 201 : result.transfer.state === 'expired' ? 410 : 200, result.transfer);
        onWork();
      } finally { uploads--; }
    } catch (error) {
      const statusCode = error instanceof BridgeError ? error.statusCode : 503;
      json(request, response, statusCode, { error: error instanceof BridgeError ? error.code : 'unavailable' });
    }
  });
  server.maxHeadersCount = 32; server.maxConnections = 32; server.keepAliveTimeout = 3000; server.maxRequestsPerSocket = 100;
  server.setTimeout(8000, socket => socket.destroy());
  server.on('checkContinue', (req, res) => json(req, res, 417, { error: 'invalid' }));
  server.on('checkExpectation', (req, res) => json(req, res, 417, { error: 'invalid' }));
  server.on('upgrade', (_req, socket) => socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  return {
    server, snapshot: () => ({ uploads, closing }),
    close: async () => { closing = true; server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); },
  };
}
