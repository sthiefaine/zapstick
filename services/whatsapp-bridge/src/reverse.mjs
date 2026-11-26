import {validateIncomingSticker} from './media.mjs';
import {decodeIncomingOpus} from './incoming-media.mjs';

const HELP = 'Envoie-moi un sticker pour le modifier : 3 liens actifs maximum, valables 10 min. Pour recevoir un sticker du site, envoie le message « Sticker ZAP … » prérempli.';
/** Reserve synchronously, then process a bounded queue one sticker at a time.
 * Neither sender JIDs nor message contents are written to logs or raw metadata. */
export class ReverseBridge {
  constructor({store, transport, siteUrl, decodeSound = decodeIncomingOpus, clock = Date.now, onEvent = () => {}}) {
    Object.assign(this, {store, transport, siteUrl, decodeSound, clock, onEvent});
    this.queue = []; this.running = null; this.current = null; this.stopping = false;
  }
  receive(event) {
    if (this.stopping) return;
    if (event.kind === 'help') { this.reply(event, HELP, 'help'); return; }
    if (!this.siteUrl) { this.reply(event, 'La modification de stickers est momentanément indisponible.', 'unavailable'); return; }
    let job;
    try { job = this.store.reserveReverse(event); }
    catch (error) { this.reply(event, error.code === 'user_limit' ? 'Tu as déjà 3 liens actifs. Réessaie après leur expiration (10 min).' : 'Trop de demandes. Réessaie dans un instant.', 'quota'); return; }
    if (!job) return;
    this.report('received');
    this.queue.push({event, job}); this.kick();
  }
  report(event) { try { this.onEvent(event); } catch {} }
  reply(event, text, kind) {
    try { if (this.store.allowBotReply(event, kind)) void this.transport.sendText({recipient: event.recipient, text}).catch(() => {}); } catch {}
  }
  kick() {
    if (this.running || this.stopping) return;
    this.running = this.drain().catch(() => {}).finally(() => { this.running = null; if (this.queue.length && !this.stopping) this.kick(); });
  }
  async drain() {
    while (!this.stopping && this.queue.length) {
      const {event, job} = this.queue.shift(), controller = new AbortController();
      this.current = {id: job.id, controller};
      let ready = false, stage = 'download_visual';
      const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.min(45_000, job.expiresAt - this.clock()))); timeout.unref();
      try {
        if (job.expiresAt <= this.clock()) throw new Error();
        const visual = await this.transport.downloadIncoming({message: event.sticker, type: 'sticker', maximum: 500 * 1024, signal: controller.signal});
        stage = 'validate_visual';
        const media = validateIncomingSticker(visual);
        let sound;
        if (event.audio) {
          if (media.kind !== 'animated') throw new Error();
          stage = 'download_audio';
          const encoded = await this.transport.downloadIncoming({message: event.audio, type: 'audio', maximum: 512 * 1024, signal: controller.signal});
          stage = 'decode_audio';
          sound = await this.decodeSound({bytes: encoded, duration: media.duration, signal: controller.signal});
          validateIncomingSticker(visual, sound);
        }
        if (controller.signal.aborted || this.stopping || job.expiresAt <= this.clock()) throw new Error();
        stage = 'save';
        this.store.completeReverse(job.id, {visual, sound, media}); ready = true;
        const link = `${this.siteUrl}/fr#edit=${job.token}`;
        stage = 'reply';
        await this.transport.sendText({recipient: event.recipient, text: `Modifie ton sticker :\n${link}\nLien temporaire (10 min max).`});
        this.report('ready');
      } catch (error) {
        const reason = stage === 'validate_visual' && ['structure','dimensions','frame','duration','metadata','chunk','frames','metadata_flags','alpha_flag'].includes(error?.reason) ? '_' + error.reason : '';
        this.report('failed_' + stage + reason);
        // A link may already have been handed to WhatsApp. Keep a ready job
        // readable until expiry; failed downloads release their reservation.
        this.store.failReverse(job.id);
        if (!ready && !this.stopping) this.reply(event, 'Impossible de préparer ce sticker. Envoie un sticker de 6 secondes maximum, avec ou sans son.', 'invalid');
      } finally { clearTimeout(timeout); this.current = null; }
    }
  }
  async close() {
    this.stopping = true; this.current?.controller.abort();
    for (const {job} of this.queue.splice(0)) this.store.failReverse(job.id);
    await this.running;
  }
}
