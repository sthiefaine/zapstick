import {decodeWebpFrames, parseWebpAnimation} from './webp-animation';
import {registerAudioWork} from './audio';

export const SOUND_EXPORT_MESSAGES = {
  unsupported: 'L’export vidéo avec son nécessite un navigateur récent. Essaie Chrome ou Edge à jour.',
  invalid: 'Cette animation est illisible. Essaie un autre média.',
  audio: 'Le son doit durer entre 0 et 6 secondes.',
  large: 'Cette animation est trop volumineuse pour l’export avec son.',
  encode: 'Impossible de préparer la vidéo avec son. Essaie un autre navigateur.',
  timeout: 'La préparation de la vidéo prend trop de temps. Réessaie.',
  cancelled: 'Préparation de la vidéo annulée.',
  busy: 'Une vidéo avec son est déjà en préparation.',
} as const;

export class SoundExportError extends Error {
  constructor(public readonly code: keyof typeof SOUND_EXPORT_MESSAGES) {
    super(SOUND_EXPORT_MESSAGES[code]);
    this.name = code === 'cancelled' ? 'AbortError' : 'SoundExportError';
  }
}

export type SoundVideoOptions = {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
  background?: string;
};
export type SoundVideo = {blob: Blob; extension: 'mp4' | 'webm'};
const MAX_SECONDS = 6;
const TIMEOUT_MS = 90_000;
let active = false;

/** Encodes the final WebP's composed frames, rather than recording a live preview.
 * Timestamps preserve its frame timing; audio and video end together. Mediabunny
 * and the browser encoders load only when the user requests this local export.
 * The result is an ordinary video, not a native WhatsApp sound-sticker package.
 * APIs: https://mediabunny.dev/guide/media-sources (pinned to 1.66.4).
 */
export async function exportSoundVideo(
  visual: Blob,
  audio: AudioBuffer,
  {signal, onProgress, background = '#ffffff'}: SoundVideoOptions = {},
): Promise<SoundVideo> {
  if (signal?.aborted) throw new SoundExportError('cancelled');
  if (active) throw new SoundExportError('busy');
  if (!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > MAX_SECONDS + 0.0001
    || audio.numberOfChannels < 1 || audio.numberOfChannels > 2 || audio.sampleRate < 8000 || audio.sampleRate > 192000) {
    throw new SoundExportError('audio');
  }
  if (visual.size > 20 * 1024 * 1024) throw new SoundExportError('large');
  if (typeof window === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
    throw new SoundExportError('unsupported');
  }

  active = true;
  const controller = new AbortController();
  let stopped: SoundExportError | undefined;
  let output: import('mediabunny').Output | undefined;
  let canvas: OffscreenCanvas | undefined;
  let frames: ReturnType<typeof decodeWebpFrames> | undefined;
  let progress = 0;
  const report = (value: number) => {
    progress = Math.max(progress, Math.min(100, value));
    try { onProgress?.(progress); } catch { /* A UI callback must not strand an encoder. */ }
  };
  const cancelOutput = () => {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      void output.cancel().catch(() => undefined);
    }
  };
  let rejectStopped!: (error: SoundExportError) => void;
  const stopPromise = new Promise<never>((_, reject) => { rejectStopped = reject; });
  // This promise may reject while a synchronous validation step is running.
  void stopPromise.catch(() => undefined);
  const stop = (code: 'cancelled' | 'timeout') => {
    if (stopped) return;
    stopped = new SoundExportError(code);
    controller.abort();
    cancelOutput();
    rejectStopped(stopped);
  };
  const abort = () => stop('cancelled');
  const timer = setTimeout(() => stop('timeout'), TIMEOUT_MS);
  signal?.addEventListener('abort', abort, {once: true});
  const unregister = registerAudioWork(() => stop('cancelled'));
  const check = () => { if (stopped) throw stopped; };
  const wait = <T>(promise: Promise<T>) => Promise.race([promise, stopPromise]);

  try {
    if (signal?.aborted) stop('cancelled');
    check();
    report(0);
    const bytes = new Uint8Array(await wait(visual.arrayBuffer()));
    let animation: ReturnType<typeof parseWebpAnimation>;
    try { animation = parseWebpAnimation(bytes); }
    catch { throw new SoundExportError('invalid'); }
    const duration = Math.min(MAX_SECONDS, animation.frames.reduce((sum, frame) => sum + frame.durationMs, 0) / 1000);
    if (duration <= 0) throw new SoundExportError('invalid');

    const bunny = await wait(import('mediabunny'));
    check();
    const videoQuality = new bunny.Quality({bitrate: 2_000_000});
    const audioQuality = new bunny.Quality({bitrate: 128_000});
    const videoConfig = {width: 512, height: 512, quality: videoQuality};
    const audioConfig = {numberOfChannels: audio.numberOfChannels, sampleRate: 48000, quality: audioQuality};
    const [avc, aac] = await wait(Promise.all([
      bunny.canEncodeVideo('avc', videoConfig), bunny.canEncodeAudio('aac', audioConfig),
    ]));
    let extension: SoundVideo['extension'] = 'mp4';
    if (!avc || !aac) {
      const [vp8, opus] = await wait(Promise.all([
        bunny.canEncodeVideo('vp8', videoConfig), bunny.canEncodeAudio('opus', audioConfig),
      ]));
      if (!vp8 || !opus) throw new SoundExportError('unsupported');
      extension = 'webm';
    }
    check();
    canvas = new OffscreenCanvas(512, 512);
    const context = canvas.getContext('2d', {alpha: false});
    if (!context) throw new SoundExportError('unsupported');
    const target = new bunny.BufferTarget();
    output = new bunny.Output({
      format: extension === 'mp4' ? new bunny.Mp4OutputFormat({fastStart: 'in-memory'}) : new bunny.WebMOutputFormat(),
      target,
    });
    const videoSource = new bunny.CanvasSource(canvas, {
      codec: extension === 'mp4' ? 'avc' : 'vp8', quality: videoQuality, keyFrameInterval: 2,
    });
    const audioSource = new bunny.AudioBufferSource({
      codec: extension === 'mp4' ? 'aac' : 'opus', quality: audioQuality, transform: {sampleRate: 48000},
    });
    output.addVideoTrack(videoSource);
    output.addAudioTrack(audioSource);
    await wait(output.start());
    check();
    // Keep a common end timestamp, padding short sounds and trimming long ones.
    const alignedAudio = new AudioBuffer({
      length: Math.max(1, Math.round(duration * audio.sampleRate)),
      sampleRate: audio.sampleRate, numberOfChannels: audio.numberOfChannels,
    });
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      alignedAudio.copyToChannel(audio.getChannelData(channel).subarray(0, alignedAudio.length), channel);
    }
    frames = decodeWebpFrames(bytes, animation, {strategy: 'bitmap', signal: controller.signal});
    const encodeFrames = async () => {
      let timestamp = 0;
      try {
        for await (const frame of frames!) {
          check();
          const frameDuration = Math.min(frame.durationMs / 1000, duration - timestamp);
          if (frameDuration <= 0.000001) break;
          // Paint white first so even a translucent custom background is opaque.
          context.fillStyle = '#ffffff';context.fillRect(0, 0, 512, 512);
          context.fillStyle = background;context.fillRect(0, 0, 512, 512);
          const scale = Math.min(512 / frame.width, 512 / frame.height);
          const width = frame.width * scale, height = frame.height * scale;
          context.drawImage(frame.canvas, (512 - width) / 2, (512 - height) / 2, width, height);
          await wait(videoSource.add(timestamp, frameDuration));
          timestamp += frameDuration;
          report(Math.min(94, timestamp / duration * 94));
          if (timestamp >= duration - 0.000001) break;
        }
      } finally { videoSource.close(); }
    };
    // Feed both tracks together to respect the muxer's interleaving backpressure.
    await wait(Promise.all([
      audioSource.add(alignedAudio).finally(() => audioSource.close()), encodeFrames(),
    ]));
    check();
    report(96);
    await wait(output.finalize());
    check();
    if (!target.buffer?.byteLength || target.buffer.byteLength > 12 * 1024 * 1024) throw new SoundExportError('large');
    const blob = new Blob([target.buffer], {type: extension === 'mp4' ? 'video/mp4' : 'video/webm'});
    report(100);
    return {blob, extension};
  } catch (error) {
    if (stopped) throw stopped;
    if (error instanceof SoundExportError) throw error;
    throw new SoundExportError('encode');
  } finally {
    clearTimeout(timer);
    unregister();
    signal?.removeEventListener('abort', abort);
    controller.abort();
    cancelOutput();
    if (frames) void frames.return(undefined).catch(() => undefined);
    if (canvas) canvas.width = canvas.height = 0;
    active = false;
  }
}
