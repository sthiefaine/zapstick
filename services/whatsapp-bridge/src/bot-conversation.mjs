import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BotLimits} from './bot-limits.mjs';
import {validateIncomingSticker} from './media.mjs';
import {decodeIncomingAudio} from './incoming-media.mjs';
import {prepareCreatedSticker} from './create-media.mjs';
import {botText, botWelcome, botLanguageMenu, botLocale} from './bot-copy.mjs';
import {LANGUAGE_CHOICES} from './bot-polls.mjs';
import {pollText, menuChoices} from './bot-poll-copy.mjs';

export const BOT_HELP = botWelcome();

const TTL = 10 * 60_000;
const MAX_SESSIONS = 20;
const AUDIO_BYTES = 8 * 1024 * 1024;

/** The small ordered queue preserves /create → media → /end, even when the
 * next message arrives while WhatsApp is still downloading the first one.
 * Drafts live only in bounded memory and disappear on expiry or restart. */
export class BotConversation {
  constructor({store, transport, reverse, soundEnabled = false, key, clock = Date.now,
    decodeSound = decodeIncomingAudio, prepare = prepareCreatedSticker, onEvent = () => {}}) {
    Object.assign(this, {store, transport, reverse, soundEnabled, clock, decodeSound, prepare, onEvent});
    this.limits = new BotLimits({key, clock});
    this.sessions = new Map(); this.queue = []; this.running = null; this.current = null; this.stopping = false;
    this.timer = setInterval(() => this.sweep(), 30_000); this.timer.unref();
  }
  report(name) { try { this.onEvent(name); } catch {} }
  sweep() {
    for (const [id, draft] of this.sessions) if (draft.expiresAt <= this.clock() && this.current?.draft !== draft) this.sessions.delete(id);
  }
  receive(event) {
    if (this.stopping || !this.limits.allowInbound(event) || this.queue.length >= 24) return;
    this.queue.push({event, receivedAt: this.clock()}); this.kick();
  }
  kick() {
    if (this.running || this.stopping) return;
    this.running = this.drain().catch(() => this.report('failed')).finally(() => {
      this.running = null;
      if (this.queue.length && !this.stopping) this.kick();
    });
  }
  async reply(event, text, kind = 'workflow') {
    if (this.stopping || !this.limits.allowReply(event, {help: kind === 'help'})) return;
    try { await this.transport.sendText({recipient: event.recipient, text}); } catch {}
  }
  async showPoll(event, {title, choices, fallback, help = false}) {
    if (this.stopping || !this.limits.allowReply(event, {help})) return;
    let preparedId;
    try {
      await this.transport.sendPoll({recipient:event.recipient, title, choices,
        onPrepared: data => { this.store.saveBotPoll(event, {...data, choices}); preparedId = data.messageId; },
      });
    } catch (error) {
      this.report('poll_failed');
      // An uncertain send may still arrive; its encrypted context stays usable.
      if (error?.code === 'delivery_unknown') return;
      if (preparedId) this.store.clearBotPoll(event, preparedId);
      if (!this.stopping) await this.transport.sendText({recipient:event.recipient, text:fallback}).catch(() => {});
    }
  }
  async showMenu(event, help = false) {
    const title = `👋 Zapstick\n\n${pollText(event.locale, 'menuTitle')}${this.reverse.siteUrl ? `\n\n🌐 ${this.reverse.siteUrl}` : ''}`;
    await this.showPoll(event, {title, choices:menuChoices(event.locale), fallback:botWelcome(event.locale, this.reverse.siteUrl), help});
  }
  async drain() {
    while (!this.stopping && this.queue.length) {
      const {event, receivedAt} = this.queue.shift();
      if (receivedAt < this.clock() - 120_000) continue;
      try { await this.handle(event); } catch { this.report('failed'); }
    }
  }
  async handle(event) {
    this.sweep();
    if (event.kind === 'poll_vote') {
      const poll = this.store.getBotPoll(event);
      const action = poll && this.transport.readPollVote(event, poll);
      if (!action || !this.store.clearBotPoll(event, event.pollMessageId)) return;
      if (action.startsWith('lang:')) event = {...event, kind:'command', command:'lang', locale:botLocale(action.slice(5))};
      else if (action === 'help') event = {...event, kind:'help'};
      else event = {...event, kind:'command', command:action};
    }
    const requestedLocale = event.locale;
    const locale = botLocale(this.store.getBotLocale(event)) ?? 'en';
    event = {...event, locale};
    const t = (key, values) => botText(locale, key, values);
    const id = this.store.reverseSender(event.recipient, event.senderAliases);
    const draft = this.sessions.get(id);
    if (event.kind === 'command') {
      if (event.command === 'lang') {
        if (!requestedLocale) {
          await this.showPoll(event, {title:pollText(locale, 'languageTitle'), choices:LANGUAGE_CHOICES, fallback:botLanguageMenu(locale)}); return;
        }
        this.store.clearBotPoll(event);
        this.store.rememberBotLocale(event, requestedLocale);
        await this.reply(event, `${botText(requestedLocale, 'languageChosen')}\n${pollText(requestedLocale, 'changeLanguage')}`);
        return;
      }
      if (event.command === 'menu') { await this.showMenu(event); return; }
      this.store.clearBotPoll(event);
      if (event.command === 'edit') {
        this.sessions.delete(id);
        await this.reply(event, pollText(locale, 'editPrompt')); return;
      }
      if (event.command === 'create') {
        if (!draft && this.sessions.size >= MAX_SESSIONS) {
          await this.reply(event, t('busy')); return;
        }
        this.sessions.set(id, {expiresAt: this.clock() + TTL});
        await this.reply(event, t('newCreation'));
        return;
      }
      if (event.command === 'cancel') {
        this.sessions.delete(id);
        await this.reply(event, t(draft ? 'cancelled' : 'noCreation'));
        return;
      }
      if (event.command === 'end') {
        if (!draft?.visual) {
          await this.reply(event, t(draft ? 'missingVisual' : 'noDraftEnd')); return;
        }
        await this.finish(event, id, draft); return;
      }
    }
    if (event.kind === 'help') {
      this.store.clearBotPoll(event);
      await this.reply(event, botWelcome(locale, this.reverse.siteUrl), event.pollMessageId ? 'workflow' : 'help'); return;
    }
    if (!draft) {
      if (event.kind === 'sticker') { this.store.clearBotPoll(event); this.reverse.receive(event); }
      else await this.showMenu(event, true);
      return;
    }
    if (event.kind === 'text' || event.kind === 'unsupported') {
      await this.reply(event, t(draft.visual ? draft.sound ? 'promptSound' : 'promptSilent' : 'visualPrompt'), 'help');
      return;
    }
    this.store.clearBotPoll(event);
    if (!draft.visual && event.kind !== 'sticker') {
      await this.reply(event, t('visualFirst')); return;
    }
    if (draft.visual && !this.soundEnabled) {
      await this.reply(event, t('soundUnavailable')); return;
    }
    if (draft.visual && event.kind === 'sticker' && !event.audio) {
      await this.reply(event, t('stickerWithoutSound')); return;
    }
    const controller = new AbortController();
    this.current = {controller, draft};
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(40_000, draft.expiresAt - this.clock()))); timer.unref();
    try {
      if (!draft.visual) {
        const visual = await this.transport.downloadIncoming({message: event.sticker, type: 'sticker', maximum: 1024 * 1024, signal: controller.signal, messageKey: event.messageKey});
        validateIncomingSticker(visual);
        if (controller.signal.aborted || this.stopping) return;
        draft.visual = visual;
        await this.reply(event, t('visualReady'));
      } else {
        const encoded = await this.transport.downloadIncoming({message: event.audio, type: event.kind === 'audio' ? event.mediaType : 'audio', maximum: event.kind === 'sticker' ? 512 * 1024 : AUDIO_BYTES, signal: controller.signal, messageKey: event.kind === 'audio' ? event.messageKey : undefined});
        const decoded = await this.decodeSound({bytes: encoded, duration: 0, maximum: AUDIO_BYTES, signal: controller.signal});
        if (controller.signal.aborted || this.stopping) return;
        draft.sound = decoded.sound;
        const duration = new Intl.NumberFormat(locale, {minimumFractionDigits: 1, maximumFractionDigits: 1}).format(decoded.duration);
        await this.reply(event, t('soundReady', {duration}));
      }
    } catch {
      this.report('media_failed');
      await this.reply(event, t(draft.visual ? draft.sound ? 'invalidSoundSaved' : 'invalidSoundSilent' : 'invalidVisual'));
    } finally { clearTimeout(timer); this.current = null; }
  }
  async finish(event, id, draft) {
    // Reserve the final answer before starting expensive work. A denied request
    // keeps the draft, and never sends an unbounded stream of rate-limit notices.
    if (!this.limits.allowReply(event)) return;
    const controller = new AbortController(); this.current = {controller, draft};
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(60_000, draft.expiresAt - this.clock()))); timer.unref();
    let directory, handedOff = false;
    try {
      directory = await mkdtemp(path.join(tmpdir(), 'zapstick-create-'));
      const media = await this.prepare({visual: draft.visual, sound: draft.sound, dir: directory, signal: controller.signal});
      if (controller.signal.aborted || this.stopping) return;
      await this.transport.send({recipient: event.recipient, ...media, signal: controller.signal,
        onHandoff: () => { if (controller.signal.aborted || this.stopping) throw new Error('cancelled'); handedOff = true; },
      });
      this.sessions.delete(id); this.report('sent');
    } catch (error) {
      if (handedOff || error?.code === 'delivery_unknown') {
        this.sessions.delete(id);
        if (!this.stopping) await this.transport.sendText({recipient: event.recipient, text: botText(event.locale, 'deliveryUnknown')}).catch(() => {});
      } else if (!this.stopping) {
        await this.transport.sendText({recipient: event.recipient, text: botText(event.locale, 'sendFailed')}).catch(() => {});
      }
      this.report('send_failed');
    } finally { clearTimeout(timer); this.current = null; if (directory) await rm(directory, {recursive: true, force: true}); }
  }
  async close() {
    this.stopping = true; clearInterval(this.timer); this.queue.length = 0;
    this.current?.controller.abort(); await this.running;
    this.sessions.clear(); this.limits.close();
  }
}
