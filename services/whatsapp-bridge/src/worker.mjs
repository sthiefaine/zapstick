/** Serial processing also isolates sound-message serialization. No retry after an uncertain handoff. */
export class BridgeWorker {
  constructor({ store, transport, encodeOpus, enabled = false, soundEnabled = false, clock = Date.now, intervalMs = 1000 }) {
    Object.assign(this, { store, transport, encodeOpus, enabled, soundEnabled, clock, intervalMs });
    this.running = null; this.current = null; this.stopping = false; this.timer = null;
  }
  start() { if (!this.timer) { this.timer = setInterval(() => this.kick(), this.intervalMs); this.timer.unref(); } this.kick(); }
  kick() {
    if (this.stopping || this.running) return this.running;
    this.running = this.drain().catch(() => {}).finally(() => { this.running = null; });
    return this.running;
  }
  cancel(id) { if (this.current?.id === id && this.store.row(id)?.state !== 'sending') this.current.controller.abort(); }
  async drain() {
    this.store.sweep();
    while (!this.stopping && this.enabled && this.transport.isReady()) {
      const job = this.store.take(); if (!job) return;
      const controller = new AbortController(); this.current = { id: job.id, controller };
      const deadline = setTimeout(() => { controller.abort(); this.store.sweep(); }, Math.max(1, job.expiresAt - this.clock())); deadline.unref();
      try {
        if (job.hasSound && !this.soundEnabled) throw Object.assign(new Error('sound_unavailable'), { code: 'sound_unavailable' });
        if (job.hasSound) await this.encodeOpus({ inputPath: job.wavPath, outputPath: job.oggPath, signal: controller.signal });
        if (controller.signal.aborted || this.store.row(job.id)?.state !== 'processing') throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        const result = await this.transport.send({ recipient: job.recipient, webpPath: job.webpPath, oggPath: job.hasSound ? job.oggPath : undefined, kind: job.kind, duration: job.duration, transferId: job.id, signal: controller.signal,
          onHandoff: async ({ messageId }) => {
            if (controller.signal.aborted || !this.store.markSending(job.id, messageId)) throw Object.assign(new Error('expired'), { code: 'expired' });
          },
        });
        if (this.store.row(job.id)?.state === 'processing') throw new Error('invalid_transport');
        this.store.finish(job.id, 'accepted', { messageId: result.messageId });
      } catch (error) {
        const state = this.store.row(job.id)?.state;
        if (state === 'sending' || error?.code === 'delivery_unknown') this.store.finish(job.id, 'delivery_unknown', { error: 'delivery_unknown', messageId: error?.messageId });
        else if (!['cancelled', 'expired', 'delivered'].includes(state)) this.store.finish(job.id, this.clock() >= job.expiresAt ? 'expired' : 'failed', { error: error?.code === 'sound_unavailable' ? 'sound_unavailable' : 'unavailable' });
      } finally { clearTimeout(deadline); this.current = null; }
    }
  }
  async close() { this.stopping = true; clearInterval(this.timer); this.current?.controller.abort(); await this.running; }
}
