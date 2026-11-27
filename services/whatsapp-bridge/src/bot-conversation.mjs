import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {BotLimits} from './bot-limits.mjs';
import {validateIncomingSticker} from './media.mjs';
import {decodeIncomingAudio} from './incoming-media.mjs';
import {prepareCreatedSticker} from './create-media.mjs';

export const BOT_HELP = `👋 Crée ou modifie tes stickers avec Zapstick.

🔗 Modifier sur le site
Envoie un sticker : je te donne son lien d’édition (5 liens actifs, valables 10 min).

✨ Créer ici
/create — démarre une création
1. Envoie ton sticker fixe ou animé : je garde son visuel, sans son.
2. Facultatif : envoie un vocal, un fichier audio ou un sticker sonore. Seul son audio sera utilisé.
3. /end — reçois ton sticker, avec le son ajouté ou sans son.

Tu peux remplacer le son en en envoyant un autre. Les 6 premières secondes sont utilisées.
/cancel — annule la création
/help — affiche cette aide

Pour recevoir un sticker créé sur le site, envoie le message « Sticker ZAP … » prérempli.`;

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
  async drain() {
    while (!this.stopping && this.queue.length) {
      const {event, receivedAt} = this.queue.shift();
      if (receivedAt < this.clock() - 120_000) continue;
      try { await this.handle(event); } catch { this.report('failed'); }
    }
  }
  async handle(event) {
    this.sweep();
    const id = this.store.reverseSender(event.recipient, event.senderAliases);
    const draft = this.sessions.get(id);
    if (event.kind === 'command') {
      if (event.command === 'create') {
        if (!draft && this.sessions.size >= MAX_SESSIONS) {
          await this.reply(event, 'Le bot est occupé. Réessaie dans un instant.'); return;
        }
        this.sessions.set(id, {expiresAt: this.clock() + TTL});
        await this.reply(event, '✨ Nouvelle création\nEnvoie ton sticker fixe, animé ou sonore. Je garde uniquement son visuel.\n\n/cancel pour annuler · création valable 10 min.');
        return;
      }
      if (event.command === 'cancel') {
        this.sessions.delete(id);
        await this.reply(event, draft ? 'Création annulée.\n/create pour recommencer, ou envoie un sticker pour obtenir son lien d’édition.' : 'Aucune création en cours.\n/create pour commencer.');
        return;
      }
      if (event.command === 'end') {
        if (!draft?.visual) {
          await this.reply(event, draft ? 'Il manque le visuel : envoie d’abord un sticker fixe ou animé, puis /end.' : 'Aucune création en cours.\nTape /create, puis envoie ton sticker.'); return;
        }
        await this.finish(event, id, draft); return;
      }
    }
    if (event.kind === 'help') { await this.reply(event, BOT_HELP, 'help'); return; }
    if (!draft) {
      if (event.kind === 'sticker') this.reverse.receive(event);
      else await this.reply(event, BOT_HELP, 'help');
      return;
    }
    if (event.kind === 'text' || event.kind === 'unsupported') {
      await this.reply(event, draft.visual
        ? `Visuel prêt${draft.sound ? ' avec ton son' : ', sans son'}.\nEnvoie un vocal, un fichier audio ou un sticker sonore pour ${draft.sound ? 'remplacer' : 'ajouter'} le son.\n/end pour recevoir le sticker · /cancel pour annuler.`
        : 'Envoie un sticker fixe, animé ou sonore pour choisir le visuel.\n/cancel pour annuler.', 'help');
      return;
    }
    if (!draft.visual && event.kind !== 'sticker') {
      await this.reply(event, 'D’abord le visuel 🙂 Envoie un sticker fixe ou animé. Tu pourras ajouter le son juste après.'); return;
    }
    if (draft.visual && !this.soundEnabled) {
      await this.reply(event, 'L’ajout de son est momentanément indisponible.\n/end pour recevoir ton sticker sans son.'); return;
    }
    if (draft.visual && event.kind === 'sticker' && !event.audio) {
      await this.reply(event, 'Ce sticker n’a pas de son. Ton visuel est conservé.\nEnvoie un vocal, un fichier audio ou un sticker sonore ; /end pour terminer.'); return;
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
        await this.reply(event, '✅ Visuel prêt, son d’origine retiré.\n\nEnvoie un vocal, un fichier audio ou un sticker sonore pour ajouter son audio.\nOu /end pour recevoir ce visuel sans son.');
      } else {
        const encoded = await this.transport.downloadIncoming({message: event.audio, type: event.kind === 'audio' ? event.mediaType : 'audio', maximum: event.kind === 'sticker' ? 512 * 1024 : AUDIO_BYTES, signal: controller.signal, messageKey: event.kind === 'audio' ? event.messageKey : undefined});
        const decoded = await this.decodeSound({bytes: encoded, duration: 0, maximum: AUDIO_BYTES, signal: controller.signal});
        if (controller.signal.aborted || this.stopping) return;
        draft.sound = decoded.sound;
        await this.reply(event, `✅ Son prêt (${decoded.duration.toFixed(1).replace('.', ',')} s, 6 s maximum).\n/end pour recevoir ton sticker.\nEnvoie un autre son pour le remplacer, ou /cancel pour annuler.`);
      }
    } catch {
      this.report('media_failed');
      await this.reply(event, draft.visual
        ? `Je n’ai pas pu lire ce son. Essaie un vocal ou un fichier MP3, M4A, OGG ou WAV de 8 Mo maximum.\nTon visuel${draft.sound ? ' et le dernier son valide sont conservés' : ' est conservé, sans son'}. /end pour terminer.`
        : 'Je n’ai pas pu lire ce sticker. Envoie un sticker fixe ou animé de 6 secondes maximum.\n/cancel pour annuler.');
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
        if (!this.stopping) await this.transport.sendText({recipient: event.recipient, text: 'L’envoi a commencé, mais sa confirmation tarde. Vérifie la conversation avant de recommencer avec /create.'}).catch(() => {});
      } else if (!this.stopping) {
        await this.transport.sendText({recipient: event.recipient, text: 'Je n’ai pas pu terminer le sticker. Ta création est conservée pendant 10 min au total : réessaie /end, ou /cancel pour annuler.'}).catch(() => {});
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
