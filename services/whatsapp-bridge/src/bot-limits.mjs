import {createHmac} from 'node:crypto';

const POLICIES = Object.freeze({
  inbound: {burst: 8, interval: 2_000},
  reply: {burst: 6, interval: 3_000},
  globalInbound: {burst: 80, interval: 500},
  globalReply: {burst: 40, interval: 1_000},
});
const HELP_COOLDOWN_MS = 30_000;
const EVENT_TTL_MS = 120_000;
const IDENTITY_TTL_MS = 10 * 60_000;
const MAX_SENDERS = 2_048;
const MAX_ALIASES = 8_192;
const MAX_EVENTS = 16_384;
const MAX_SENDER_EVENTS = 128;
const address = value => typeof value === 'string' && value.length <= 160 && /^\d+(?::\d+)?@(?:s\.whatsapp\.net|lid)$/.test(value)
  ? value.replace(/:\d+(?=@)/, '') : undefined;
const bucket = (policy, now) => ({tokens: policy.burst, updatedAt: now});

function refill(value, policy, now) {
  value.tokens = Math.min(policy.burst, value.tokens + Math.max(0, now - value.updatedAt) / policy.interval);
  value.updatedAt = now;
  return value;
}

/** A quiet, bounded guard shared by help, creation and reverse imports.
 * It keeps only keyed digests in memory; denied traffic never extends a
 * cooldown. The input burst leaves room for /create, visual, sound and /end. */
export class BotLimits {
  constructor({key, clock = Date.now}) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid bot limiter key.');
    this.key = Buffer.from(key);
    this.clock = clock;
    this.senders = new Map();
    this.aliases = new Map();
    this.eventCount = 0;
    this.closed = false;
    this.lastNow = Number(clock());
    if (!Number.isFinite(this.lastNow)) throw new Error('Invalid bot limiter clock.');
    this.sweptAt = this.lastNow;
    this.globalInbound = bucket(POLICIES.globalInbound, this.lastNow);
    this.globalReply = bucket(POLICIES.globalReply, this.lastNow);
  }

  digest(label, value) {
    return createHmac('sha256', this.key).update(`bot-limit:${label}\0`).update(value).digest('hex');
  }

  now() {
    const value = Number(this.clock());
    if (Number.isFinite(value)) this.lastNow = Math.max(this.lastNow, value);
    return this.lastNow;
  }

  pruneEvents(state, now) {
    for (const seen of [state.inboundEvents, state.replyEvents]) {
      for (const [id, expiresAt] of seen) {
        if (expiresAt <= now) { seen.delete(id); this.eventCount--; }
      }
    }
  }

  sweep(now, force = false) {
    if (!force && now - this.sweptAt < 15_000) return;
    this.sweptAt = now;
    for (const [id, state] of this.senders) {
      this.pruneEvents(state, now);
      if (now - state.lastSeen < IDENTITY_TTL_MS) continue;
      this.eventCount -= state.inboundEvents.size + state.replyEvents.size;
      this.senders.delete(id);
      for (const alias of state.aliases) this.aliases.delete(alias);
    }
  }

  merge(target, source, now) {
    for (const name of ['inbound', 'reply']) {
      refill(target[name], POLICIES[name], now);
      refill(source[name], POLICIES[name], now);
      target[name].tokens = Math.min(target[name].tokens, source[name].tokens);
    }
    target.lastHelpAt = Math.max(target.lastHelpAt, source.lastHelpAt);
    target.lastSeen = Math.max(target.lastSeen, source.lastSeen);
    for (const name of ['inboundEvents', 'replyEvents']) {
      for (const [id, expiresAt] of source[name]) {
        if (target[name].has(id)) {
          target[name].set(id, Math.max(target[name].get(id), expiresAt));
          this.eventCount--;
        } else target[name].set(id, expiresAt);
      }
      // A merged alias must not turn two full histories into an unbounded one.
      while (target[name].size > MAX_SENDER_EVENTS) {
        target[name].delete(target[name].keys().next().value);
        this.eventCount--;
      }
    }
    for (const alias of source.aliases) {
      target.aliases.add(alias);
      this.aliases.set(alias, target.id);
    }
    this.senders.delete(source.id);
  }

  sender(event, now) {
    if (this.closed || !address(event?.recipient)) return undefined;
    this.sweep(now);
    const candidates = Array.isArray(event.senderAliases) ? event.senderAliases.slice(0, 8) : [];
    const hashes = [...new Set([event.recipient, ...candidates].map(address).filter(Boolean))]
      .map(value => this.digest('address', value));
    const existing = [...new Set(hashes.map(hash => this.aliases.get(hash)).filter(Boolean))]
      .map(id => this.senders.get(id)).filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    const newAliases = hashes.filter(hash => !this.aliases.has(hash));
    if (this.aliases.size + newAliases.length > MAX_ALIASES || (!existing.length && this.senders.size >= MAX_SENDERS)) return undefined;
    let state = existing[0];
    if (!state) {
      state = {id: hashes[0], createdAt: now, lastSeen: now, lastHelpAt: Number.NEGATIVE_INFINITY,
        inbound: bucket(POLICIES.inbound, now), reply: bucket(POLICIES.reply, now),
        aliases: new Set(), inboundEvents: new Map(), replyEvents: new Map()};
      this.senders.set(state.id, state);
    }
    this.pruneEvents(state, now);
    for (const previous of existing.slice(1)) {
      this.pruneEvents(previous, now);
      this.merge(state, previous, now);
    }
    for (const hash of hashes) { state.aliases.add(hash); this.aliases.set(hash, state.id); }
    state.lastSeen = now;
    return state;
  }

  eventId(event) {
    const id = event?.providerMessageId;
    return typeof id === 'string' && id.length > 0 && id.length <= 160 ? this.digest('event', id) : undefined;
  }

  remember(seen, id, now) {
    if (seen.has(id)) return false;
    if (this.eventCount >= MAX_EVENTS) {
      this.sweep(now, true);
      if (this.eventCount >= MAX_EVENTS) return false;
    }
    if (seen.size >= MAX_SENDER_EVENTS) {
      seen.delete(seen.keys().next().value);
      this.eventCount--;
    }
    seen.set(id, now + EVENT_TTL_MS);
    this.eventCount++;
    return true;
  }

  allowInbound(event) {
    const id = this.eventId(event), now = this.now();
    if (!id) return false;
    const state = this.sender(event, now);
    if (!state || !this.remember(state.inboundEvents, id, now)) return false;
    const user = refill(state.inbound, POLICIES.inbound, now);
    const global = refill(this.globalInbound, POLICIES.globalInbound, now);
    if (user.tokens < 1 || global.tokens < 1) return false;
    user.tokens--; global.tokens--;
    return true;
  }

  allowReply(event, {help = false} = {}) {
    const id = this.eventId(event), now = this.now();
    if (!id) return false;
    const state = this.sender(event, now);
    if (!state || state.replyEvents.has(id)) return false;
    if (help && now - state.lastHelpAt < HELP_COOLDOWN_MS) return false;
    const global = refill(this.globalReply, POLICIES.globalReply, now);
    const user = refill(state.reply, POLICIES.reply, now);
    if (global.tokens < 1 || (!help && user.tokens < 1)) return false;
    if (!this.remember(state.replyEvents, id, now)) return false;
    global.tokens--;
    if (help) state.lastHelpAt = now;
    else user.tokens--;
    return true;
  }

  /** Useful for conversation state without retaining a raw phone number. */
  senderKey(event) { return this.sender(event, this.now())?.id; }

  close() {
    this.closed = true;
    this.senders.clear(); this.aliases.clear(); this.eventCount = 0;
    this.key.fill(0);
  }
}
