const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const RECONNECT_WINDOW = 15 * MINUTE;
const PAUSE_REASONS = new Set(['operator', 'logged_out', 'restricted', 'rate_limited', 'session_error', 'unstable_connection', 'repeated_send_errors', 'storage_error']);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const history = (value, maximum) => Array.isArray(value) && value.length <= maximum && value.every(timestamp) && value.every((time, index) => !index || time >= value[index - 1]);
const unavailable = () => Object.assign(new Error('WhatsApp transport is paused or busy.'), {code: 'unavailable'});

/** Only numeric protocol diagnostics are retained. They are not a ban diagnosis. */
export function protocolStatus(error) {
  for (const value of [error?.output?.statusCode, error?.statusCode, error?.data?.code, error?.data?.attrs?.code]) {
    if ((typeof value === 'number' || typeof value === 'string' && /^\d{3}$/.test(value)) && Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 599) return Number(value);
  }
  return undefined;
}

/** Local backpressure, shared by text, polls and stickers. These limits are
 * Zapstick's operational choices, not quotas approved by WhatsApp. State is
 * encrypted by the existing auth store, under its exclusive process lock. */
export class TransportSafety {
  constructor({read = () => undefined, write = () => {}, clock = Date.now, onEvent = () => {}} = {}) {
    Object.assign(this, {write, clock, onEvent});
    this.nowValue = Number(clock());
    if (!timestamp(this.nowValue)) throw unavailable();
    const saved = read();
    if (saved !== undefined && (!saved || saved.version !== 1 || !history(saved.outbound, 240) || !history(saved.connections, 8)
      || !history(saved.errors, 3) || !timestamp(saved.nextConnectAt) || saved.paused !== null && (!saved.paused
        || !PAUSE_REASONS.has(saved.paused.reason) || !timestamp(saved.paused.at)
        || saved.paused.code !== undefined && (!Number.isInteger(saved.paused.code) || saved.paused.code < 100 || saved.paused.code > 599)))) throw unavailable();
    this.data = saved ?? {version: 1, paused: null, outbound: [], connections: [], errors: [], nextConnectAt: 0};
    this.readyAt = this.now() + 5_000;
  }
  now() { this.nowValue = Math.max(this.nowValue, Number(this.clock()) || 0); return this.nowValue; }
  report(event, code) { try { this.onEvent({event, ...(code !== undefined ? {code} : {})}); } catch {} }
  persist() {
    try { this.write(this.data); }
    catch {
      this.data.paused = {reason: 'storage_error', at: this.now()};
      this.report('storage_error'); throw unavailable();
    }
  }
  prune() {
    const now = this.now();
    this.data.outbound = this.data.outbound.filter(at => at > now - HOUR);
    this.data.connections = this.data.connections.filter(at => at > now - RECONNECT_WINDOW);
    this.data.errors = this.data.errors.filter(at => at > now - MINUTE);
  }
  isPaused() { return this.data.paused !== null; }
  pause(reason, code) {
    if (!PAUSE_REASONS.has(reason)) throw unavailable();
    if (this.isPaused()) return;
    this.data.paused = {reason, at: this.now(), ...(code !== undefined ? {code} : {})};
    this.persist(); this.report(reason, code);
  }
  resume() {
    // Only the private administrator command calls this. Keep all rate budgets.
    this.data.paused = null; this.data.connections = []; this.data.errors = [];
    this.data.nextConnectAt = this.now() + 5_000;
    this.persist(); this.report('resumed');
  }
  connectionDelay() {
    if (this.isPaused()) throw unavailable();
    this.prune();
    if (this.data.connections.length >= 8) { this.pause('unstable_connection'); throw unavailable(); }
    return Math.max(0, this.data.nextConnectAt - this.now());
  }
  recordConnection() {
    if (this.connectionDelay() > 0) throw unavailable();
    const now = this.now();
    this.data.connections.push(now);
    this.data.nextConnectAt = now + Math.min(30_000, 2_000 * 2 ** (this.data.connections.length - 1));
    this.persist();
  }
  connected() { this.readyAt = this.now() + 5_000; }
  sendDelay() {
    if (this.isPaused()) throw unavailable();
    this.prune();
    const now = this.now(), sends = this.data.outbound;
    const minute = sends.filter(at => at > now - MINUTE);
    return Math.max(0, this.readyAt - now, (sends.at(-1) ?? now - 3_000) + 3_000 - now,
      minute.length >= 20 ? minute[0] + MINUTE - now : 0,
      sends.length >= 240 ? sends[0] + HOUR - now : 0);
  }
  recordSend() {
    if (this.sendDelay() > 0) throw unavailable();
    // Reserve before relay: a lost acknowledgement still consumes its budget.
    this.data.outbound.push(this.now()); this.persist();
  }
  failed(error, {connection = false} = {}) {
    const code = protocolStatus(error);
    this.report(connection ? 'connection_failed' : 'send_failed', code);
    const reason = [401, 440].includes(code) ? 'logged_out' : [403, 411, 463].includes(code) ? 'restricted'
      : code === 429 ? 'rate_limited' : code === 500 && connection ? 'session_error' : undefined;
    if (reason) { this.pause(reason, code); return; }
    if (!connection && !this.isPaused()) {
      this.prune(); this.data.errors.push(this.now());
      if (this.data.errors.length >= 3) this.pause('repeated_send_errors', code);
      else this.persist();
    }
  }
  succeeded() {
    if (this.data.errors.length) { this.data.errors = []; this.persist(); }
  }
  status() {
    this.prune();
    return {paused: this.data.paused, sendsLastHour: this.data.outbound.length, connectionsLast15Minutes: this.data.connections.length};
  }
}
