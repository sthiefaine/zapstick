const MAX_BODY = 4 * 1024 * 1024;
const MAX_REPLY = 8192;
const ID = /^[A-Za-z0-9_-]{22}$/;
const RECEIPT = /^Bearer ([A-Za-z0-9_-]{43})$/;
const PREFIX = '/api/whatsapp/transfers';
const STATES = new Set(['awaiting_message', 'queued', 'processing', 'sending', 'accepted', 'delivered', 'delivery_unknown', 'failed', 'cancelled', 'expired']);
const ERRORS = new Set(['unavailable', 'busy', 'invalid', 'too_large', 'not_found', 'expired', 'conflict', 'sound_unavailable', 'timeout', 'cancelled']);
const HEADERS = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow'};
type Environment = Record<string, string | undefined>;
class RelayError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
function json(value: unknown, status = 200, retry = false) {
  return Response.json(value, {status, headers: {...HEADERS, ...(retry ? {'Retry-After': '5'} : {})}});
}
function configured(env: Environment) {
  if (env.WHATSAPP_BRIDGE_ENABLED !== 'true' || !env.WHATSAPP_BRIDGE_TOKEN || env.WHATSAPP_BRIDGE_TOKEN.length < 32) return;
  try {
    const url = new URL(env.WHATSAPP_BRIDGE_URL || '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') return;
    return {url, token: env.WHATSAPP_BRIDGE_TOKEN};
  } catch { return; }
}
function sameOrigin(request: Request, env: Environment) {
  const site = new URL(env.SITE_URL || request.url).origin;
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (origin && origin !== site || fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false;
  return request.method === 'GET' || origin === site;
}
async function boundedBody(body: ReadableStream<Uint8Array> | null, maximum: number, signal: AbortSignal) {
  if (!body) return new Uint8Array();
  const reader = body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    if (signal.aborted) throw new RelayError(408, 'timeout');
    while (true) {
      const part = await reader.read();
      if (signal.aborted) throw new RelayError(408, 'timeout');
      if (part.done) break;
      length += part.value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new RelayError(413, 'too_large'); }
      chunks.push(part.value);
    }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  const result = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { result.set(chunk, at); at += chunk.byteLength; }
  return result;
}

/** Same-origin BFF. Credentials and private network addresses never reach the browser. */
export function createWhatsAppBridgeHandler({env = () => process.env, fetchImpl = fetch, timeoutMs = 20_000}: {env?: () => Environment; fetchImpl?: typeof fetch; timeoutMs?: number} = {}) {
  let active = 0, uploads = 0;
  return async function handle(request: Request) {
    const url = new URL(request.url), environment = env();
    const statusRoute = url.pathname === '/api/whatsapp/status';
    const collection = url.pathname === PREFIX;
    const id = url.pathname.startsWith(PREFIX + '/') ? url.pathname.slice(PREFIX.length + 1) : undefined;
    if (url.search || !(statusRoute || collection || id && ID.test(id))) return json({error: 'not_found'}, 404);
    const allowed = statusRoute ? ['GET'] : collection ? ['POST'] : ['GET', 'DELETE'];
    if (!allowed.includes(request.method)) return new Response(null, {status: 405, headers: {...HEADERS, Allow: allowed.join(', ')}});
    try { if (!sameOrigin(request, environment)) return json({error: 'unavailable'}, 403); }
    catch { return json({error: 'unavailable'}, 503); }
    const config = configured(environment);
    if (statusRoute && !config) return json({enabled: false, ready: false, soundEnabled: false});
    if (!config) return json({error: 'unavailable'}, 503, true);
    const unavailableStatus = () => json({enabled: true, ready: false, soundEnabled: environment.WHATSAPP_SOUND_ENABLED === 'true'});
    const receipt = request.headers.get('authorization')?.match(RECEIPT)?.[1];
    if (!statusRoute && !receipt) return json({error: 'not_found'}, 404);
    const uploading = request.method === 'POST';
    if (active >= 8 || uploading && uploads >= 2) return json({error: 'busy'}, 429, true);
    const length = request.headers.get('content-length');
    if (uploading && length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) return json({error: 'too_large'}, 413);
    const contentType = request.headers.get('content-type') || '';
    if (uploading && !/^multipart\/form-data;\s*boundary=(?:"[\w'()+,./:=? -]{1,70}"|[\w'()+,./:=?-]{1,70})$/i.test(contentType)) return json({error: 'invalid'}, 415);
    active++; if (uploading) uploads++;
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
    try {
      const body = uploading ? await boundedBody(request.body, MAX_BODY, signal) : undefined;
      // The public sound gate is enforced here as well as in the interface.
      // Private administrators may enable sound for tests before public rollout.
      if (uploading && environment.WHATSAPP_SOUND_ENABLED !== 'true') {
        let form: FormData;
        try { form = await new Request('http://bridge.invalid/', {method: 'POST', headers: {'Content-Type': contentType}, body: body as BodyInit}).formData(); }
        catch { return json({error: 'invalid'}, 400); }
        if (form.has('sound')) return json({error: 'sound_unavailable'}, 422);
      }
      const target = new URL(statusRoute ? '/internal/v1/status' : '/internal/v1/transfers' + (id ? '/' + id : ''), config.url);
      const headers: Record<string, string> = {Authorization: `Bearer ${config.token}`, Accept: 'application/json'};
      if (receipt) headers['X-Transfer-Receipt'] = receipt;
      if (uploading) headers['Content-Type'] = contentType;
      const upstream = await fetchImpl(target, {method: request.method, headers, body: body as BodyInit | undefined, signal, cache: 'no-store', redirect: 'error'});
      const bytes = await boundedBody(upstream.body, MAX_REPLY, signal);
      const value = JSON.parse(new TextDecoder().decode(bytes));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid bridge reply.');
      if (statusRoute && upstream.ok) return json({enabled: true, ready: value.ready === true, soundEnabled: environment.WHATSAPP_SOUND_ENABLED === 'true' && value.soundEnabled === true});
      if (!upstream.ok) {
        if (statusRoute) return unavailableStatus();
        const status = [400, 404, 409, 410, 413, 415, 422, 429, 503, 504].includes(upstream.status) ? upstream.status : 503;
        const fallback = status === 410 ? 'expired' : status === 409 ? 'conflict' : status === 413 ? 'too_large' : [400, 415, 422].includes(status) ? 'invalid' : 'unavailable';
        return json({error: ERRORS.has(value.error) ? value.error : fallback}, status, status === 429 || status === 503);
      }
      if (!ID.test(value.id) || id && value.id !== id || !STATES.has(value.state) || !Number.isFinite(value.expiresAt)) throw new Error('Invalid transfer reply.');
      const output: Record<string, unknown> = {id: value.id, state: value.state, expiresAt: value.expiresAt};
      if (value.error) output.error = ERRORS.has(value.error) ? value.error : 'unavailable';
      if (value.state === 'awaiting_message') {
        if (!ID.test(value.claimCode) || typeof value.waUrl !== 'string') throw new Error('Invalid claim reply.');
        const link = new URL(value.waUrl);
        if (link.protocol !== 'https:' || link.hostname !== 'wa.me' || link.username || link.password || link.port || link.hash || !/^\/[1-9]\d{6,14}$/.test(link.pathname) || ![`ZAP ${value.claimCode}`, `Sticker ZAP ${value.claimCode}`].includes(link.searchParams.get('text') || '') || [...link.searchParams.keys()].some(key => key !== 'text')) throw new Error('Invalid WhatsApp link.');
        output.claimCode = value.claimCode; output.waUrl = link.href;
      }
      return json(output, upstream.status === 201 ? 201 : 200);
    } catch (error) {
      if (statusRoute) return unavailableStatus();
      if (error instanceof RelayError) return json({error: error.code}, error.status);
      return json({error: signal.aborted ? 'timeout' : 'unavailable'}, signal.aborted ? 504 : 503, true);
    } finally { active--; if (uploading) uploads--; }
  };
}

export const handleWhatsAppRequest = createWhatsAppBridgeHandler();
