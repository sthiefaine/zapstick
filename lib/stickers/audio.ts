export type AudioTrack = { blob: Blob; buffer: AudioBuffer; name: string; source: 'original' | 'file' | 'microphone'; compositionBound?: boolean };
export type AudioRecipe = { start: number; offset: number; volume: number; duration?: number; sourcePinned?: boolean };
export type AudioLayer = { track: AudioTrack; recipe: AudioRecipe };
export const defaultAudioRecipe: AudioRecipe = { start: 0, offset: 0, volume: 1 };
/** Original sound follows video trimming until its excerpt is explicitly chosen. */
export function resolveAudioRecipe(track:AudioTrack|null,recipe:AudioRecipe,visualStart:number):AudioRecipe{
 if(track?.compositionBound)return{...recipe,offset:recipe.offset-visualStart};
 return track?.source==='original'&&!recipe.sourcePinned?{...recipe,start:visualStart+recipe.start}:recipe;
}
export const MAX_AUDIO_SOURCE_SECONDS = 30;
const MAX_OUTPUT_SECONDS = 6;
const unsupported = 'Ce format audio ne peut pas être lu dans ce navigateur.';
const noAudio = 'Aucun son détecté dans ce média.';
const tooLong = 'Choisis un son de 30 secondes maximum.';
const work = new Set<() => void>();

/** Register playback, capture and decoding so clearing local data stops all sound. */
export function registerAudioWork(stop: () => void): () => void {
 work.add(stop);
 return () => { work.delete(stop); };
}
export function stopAllAudioWork(): void {
 const pending = [...work]; work.clear();
 for (const stop of pending) { try { stop(); } catch { /* One failed cleanup must not retain the other media. */ } }
}
const aborted = (signal?: AbortSignal) => signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
function check(signal: AbortSignal): void { if (signal.aborted) throw aborted(signal); }
function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
 check(signal);
 return new Promise((resolve, reject) => {
  const abort = () => { cleanup(); reject(aborted(signal)); };
  const cleanup = () => signal.removeEventListener('abort', abort);
  signal.addEventListener('abort', abort, { once: true });
  promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  if (signal.aborted) abort();
 });
}
function createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
 if (typeof AudioBuffer === 'undefined') throw new Error(unsupported);
 return new AudioBuffer({ numberOfChannels: channels, length, sampleRate });
}
type DecodeOptions = { signal?: AbortSignal; name?: string; source?: AudioTrack['source'] };

/** Read only a bounded audio track; video frames are never decoded here. */
export async function decodeAudio(blob: Blob, options: DecodeOptions = {}): Promise<AudioTrack> {
 if (options.signal?.aborted) throw aborted(options.signal);
 const isVideo = blob.type.startsWith('video/') || options.source === 'original';
 if (blob.size > (isVideo ? 20 : 5) * 1024 * 1024) throw new Error(isVideo ? 'Choisis une vidéo de moins de 20 Mo.' : 'Choisis un fichier audio de moins de 5 Mo.');
 if (!blob.size) throw new Error(noAudio);
 const controller = new AbortController(), signal = controller.signal;
 const relay = () => controller.abort(aborted(options.signal));
 options.signal?.addEventListener('abort', relay, { once: true });
 const unregister = registerAudioWork(() => controller.abort());
 const timer = setTimeout(() => controller.abort(new Error('Le chargement du son prend trop de temps.')), 20000);
 let input: import('mediabunny').Input | undefined, context: AudioContext | undefined;
 try {
  const { Input, BlobSource, ALL_FORMATS, AudioBufferSink } = await withAbort(import('mediabunny'), signal);
  check(signal);
  input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const dispose = () => input?.dispose(); signal.addEventListener('abort', dispose, { once: true });
  const audio = await withAbort(input.getPrimaryAudioTrack(), signal);
  if (!audio) throw new Error(noAudio);
  const metadataDuration = await withAbort(audio.getDurationFromMetadata(), signal);
  if (metadataDuration !== null && metadataDuration > MAX_AUDIO_SOURCE_SECONDS + .001) throw new Error(tooLong);
  // Packet timestamps also work for MediaRecorder WebM files without Duration metadata.
  const end = await withAbort(audio.computeDuration(), signal);
  if (!Number.isFinite(end) || end <= 0) throw new Error(noAudio);
  if (end > MAX_AUDIO_SOURCE_SECONDS + .001) throw new Error(tooLong);
  let buffer: AudioBuffer;
  if (await withAbort(audio.canDecode(), signal)) {
   const sink = new AudioBufferSink(audio), buffers = sink.buffers(0, MAX_AUDIO_SOURCE_SECONDS);
   let target: AudioBuffer | undefined, copied = false, totalSamples = 0;
   try {
    for (;;) {
     const next = await withAbort(buffers.next(), signal); check(signal);
     if (next.done) break;
     const { buffer: part, timestamp } = next.value;
     if (!Number.isFinite(timestamp) || !Number.isFinite(part.sampleRate) || part.sampleRate < 8000 || part.sampleRate > 96000 || part.numberOfChannels < 1 || part.numberOfChannels > 2) throw new Error(unsupported);
     totalSamples += part.length;
     if (totalSamples > Math.ceil(MAX_AUDIO_SOURCE_SECONDS * part.sampleRate) + 4096) throw new Error(tooLong);
     target ??= createBuffer(part.numberOfChannels, Math.max(1, Math.round(Math.min(end, MAX_AUDIO_SOURCE_SECONDS) * part.sampleRate)), part.sampleRate);
     if (part.sampleRate !== target.sampleRate || part.numberOfChannels !== target.numberOfChannels) throw new Error(unsupported);
     const at = Math.round(timestamp * target.sampleRate), skip = Math.max(0, -at), to = Math.max(0, at);
     const count = Math.min(part.length - skip, target.length - to);
     if (count <= 0) continue;
     for (let channel = 0; channel < target.numberOfChannels; channel++) target.getChannelData(channel).set(part.getChannelData(channel).subarray(skip, skip + count), to);
     copied = true;
    }
   } finally { void buffers.return().catch(() => {}); }
   if (!target || !copied) throw new Error(noAudio);
   buffer = target;
  } else {
   // Older browsers may decode a container through Web Audio without AudioDecoder.
   if (typeof AudioContext === 'undefined') throw new Error(unsupported);
   context = new AudioContext({ sampleRate: 48000 });
   signal.addEventListener('abort', () => { void context?.close().catch(() => {}); }, { once: true });
   const bytes = await withAbort(blob.arrayBuffer(), signal);
   buffer = await withAbort(context.decodeAudioData(bytes), signal);
  }
  check(signal);
  if (!buffer.length || !Number.isFinite(buffer.duration)) throw new Error(noAudio);
  if (buffer.duration > MAX_AUDIO_SOURCE_SECONDS + .001) throw new Error(tooLong);
  if (buffer.numberOfChannels > 2 || buffer.sampleRate < 8000 || buffer.sampleRate > 96000) throw new Error(unsupported);
  const source = options.source ?? 'file';
  return { blob, buffer, source, name: options.name?.trim().slice(0, 120) || (source === 'original' ? 'Son de la vidéo' : source === 'microphone' ? 'Mon enregistrement' : 'Mon son') };
 } catch (error) {
  check(signal);
  if (error instanceof Error && [noAudio, tooLong, unsupported].includes(error.message)) throw error;
  throw new Error(unsupported);
 } finally {
  clearTimeout(timer); unregister(); options.signal?.removeEventListener('abort', relay);
  input?.dispose(); if (context && context.state !== 'closed') void context.close().catch(() => {});
 }
}

export type AudioWindow = { length: number; sourceStart: number; targetStart: number; count: number; volume: number; fadeSamples: number };
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
/** All timing is rounded once into the source's sample grid, shared by preview/save/export. */
export function planAudioWindow(sourceLength: number, sampleRate: number, recipe: AudioRecipe, duration: number): AudioWindow {
 if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(duration) || duration <= 0) throw new Error('Choisis une durée audio valide.');
 const length = Math.max(1, Math.round(Math.min(MAX_OUTPUT_SECONDS, duration) * sampleRate));
 const sourceSize = Math.max(0, Math.floor(finite(sourceLength))), start = Math.min(sourceSize, Math.round(Math.max(0, finite(recipe.start)) * sampleRate));
 const sourceEnd = recipe.duration !== undefined && Number.isFinite(recipe.duration)
  ? Math.min(sourceSize, start + Math.round(Math.max(0, recipe.duration) * sampleRate)) : sourceSize;
 const shift = Math.round(Math.max(-MAX_AUDIO_SOURCE_SECONDS, Math.min(MAX_AUDIO_SOURCE_SECONDS, finite(recipe.offset))) * sampleRate);
 const sourceStart = Math.min(sourceEnd, start + Math.max(0, -shift)), targetStart = Math.min(length, Math.max(0, shift));
 const count = Math.max(0, Math.min(sourceEnd - sourceStart, length - targetStart));
 return { length, sourceStart, targetStart, count, volume: Math.max(0, Math.min(2, finite(recipe.volume, 1))), fadeSamples: Math.min(Math.round(.003 * sampleRate), Math.floor(count / 2)) };
}

/** Place the second excerpt immediately after the first. The availability
 * arguments are total source durations, before subtracting each source start. */
export function arrangeAudioSequence(first: AudioRecipe, second: AudioRecipe, length: number, availableFirst: number, availableSecond: number): [AudioRecipe, AudioRecipe] {
 if (!Number.isFinite(length) || length <= 0) throw new Error('Choisis une durée audio valide.');
 const duration = Math.min(MAX_OUTPUT_SECONDS, length);
 const totalFirst = Math.max(0, finite(availableFirst)), totalSecond = Math.max(0, finite(availableSecond));
 const startFirst = Math.min(totalFirst, Math.max(0, finite(first.start))), startSecond = Math.min(totalSecond, Math.max(0, finite(second.start)));
 const remainingFirst = totalFirst - startFirst, remainingSecond = totalSecond - startSecond;
 // Keep room at the extreme right so this one-click command can actually play
 // both sounds. On very short animations the reserve shrinks with the clip.
 const reserve = remainingFirst > 0 && remainingSecond > 0 ? Math.min(.1, duration) : 0;
 const offsetFirst = Math.max(0, Math.min(duration - reserve, finite(first.offset)));
 const space = Math.max(0, duration - offsetFirst);
 const requestedFirst = first.duration !== undefined && Number.isFinite(first.duration) ? Math.max(0, first.duration) : remainingFirst;
 let durationFirst = Math.min(remainingFirst, requestedFirst, space);
 if (remainingSecond > 0 && durationFirst >= space && space > 0) durationFirst = space / 2;
 const offsetSecond = offsetFirst + durationFirst, requestedSecond = second.duration !== undefined && Number.isFinite(second.duration) ? Math.max(0, second.duration) : remainingSecond;
 const durationSecond = Math.min(remainingSecond, requestedSecond, Math.max(0, duration - offsetSecond));
 return [
  {...first, start: startFirst, offset: offsetFirst, duration: durationFirst},
  {...second, start: startSecond, offset: offsetSecond, duration: durationSecond},
 ];
}
export function renderAudio(track: AudioTrack, recipe: AudioRecipe, duration: number): AudioBuffer {
 const source = track.buffer, plan = planAudioWindow(source.length, source.sampleRate, recipe, duration);
 if (source.numberOfChannels < 1 || source.numberOfChannels > 2) throw new Error(unsupported);
 const result = createBuffer(source.numberOfChannels, plan.length, source.sampleRate);
 for (let channel = 0; channel < source.numberOfChannels; channel++) {
  const from = source.getChannelData(channel), to = result.getChannelData(channel);
  for (let i = 0; i < plan.count; i++) {
   const fade = plan.fadeSamples ? Math.max(0, Math.min(1, i / plan.fadeSamples, (plan.count - 1 - i) / plan.fadeSamples)) : 1;
   to[plan.targetStart + i] = finite(from[plan.sourceStart + i]) * plan.volume * fade;
  }
 }
 return result;
}

/** One shared, bounded PCM mix for preview, saved sound and video export.
 * Mono is duplicated into stereo only when another layer requires stereo.
 * Linear interpolation puts every layer on the same 48 kHz sample grid. */
export function renderAudioMix(layers: readonly AudioLayer[], duration: number): AudioBuffer {
 if (layers.length > 2) throw new Error('Tu peux ajouter jusqu’à deux pistes audio.');
 if (!Number.isFinite(duration) || duration <= 0) throw new Error('Choisis une durée audio valide.');
 const sampleRate = 48000, length = Math.max(1, Math.round(Math.min(MAX_OUTPUT_SECONDS, duration) * sampleRate));
 let channels = 1;
 for (const {track} of layers) {
  const source = track.buffer;
  if (![1, 2].includes(source.numberOfChannels) || !Number.isFinite(source.sampleRate) || source.sampleRate < 8000 || source.sampleRate > 96000 || !Number.isInteger(source.length) || source.length < 1) throw new Error(unsupported);
  channels = Math.max(channels, source.numberOfChannels);
 }
 const result = createBuffer(channels, length, sampleRate);
 for (const {track, recipe} of layers) {
  // Build each audible window before resampling. Offset, trim, gain and the
  // three-millisecond boundary fades therefore have exactly one definition.
  const rendered = renderAudio(track, recipe, duration), ratio = rendered.sampleRate / sampleRate;
  for (let channel = 0; channel < channels; channel++) {
   const from = rendered.getChannelData(Math.min(channel, rendered.numberOfChannels - 1)), to = result.getChannelData(channel);
   if (ratio === 1) {
    for (let frame = 0; frame < length; frame++) to[frame] += from[frame] ?? 0;
   } else {
    for (let frame = 0; frame < length; frame++) {
     const position = frame * ratio, first = Math.floor(position), fraction = position - first;
     const left = from[first] ?? 0, right = from[first + 1] ?? left;
     to[frame] += left + (right - left) * fraction;
    }
   }
  }
 }
 // A common peak gain keeps stereo balance and the two layers' relative levels.
 // A quiet or single layer stays at its selected volume instead of being halved.
 let peak = 0;
 for (let channel = 0; channel < channels; channel++) for (const sample of result.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
 if (peak > 1) for (let channel = 0; channel < channels; channel++) {
  const samples = result.getChannelData(channel);
  for (let frame = 0; frame < length; frame++) samples[frame] /= peak;
 }
 return result;
}
export function encodeWav(buffer: AudioBuffer): Blob {
 const channels = buffer.numberOfChannels, rate = buffer.sampleRate;
 if (![1, 2].includes(channels) || !Number.isInteger(rate) || rate < 8000 || rate > 96000 || buffer.length < 1 || buffer.length > Math.round(MAX_OUTPUT_SECONDS * rate)) throw new Error('Choisis une durée audio valide.');
 const bytes = new ArrayBuffer(44 + buffer.length * channels * 2), view = new DataView(bytes);
 const ascii = (at: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
 ascii(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, 'WAVE'); ascii(12, 'fmt '); view.setUint32(16, 16, true);
 view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
 ascii(36, 'data'); view.setUint32(40, bytes.byteLength - 44, true);
 const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
 for (let frame = 0, at = 44; frame < buffer.length; frame++) for (let channel = 0; channel < channels; channel++, at += 2) {
  const sample = Math.max(-1, Math.min(1, finite(data[channel][frame])));
  view.setInt16(at, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
 }
 return new Blob([bytes], { type: 'audio/wav' });
}
export function getWaveform(buffer: AudioBuffer, bins = 80): number[] {
 const count = Math.max(1, Math.min(2048, Math.floor(finite(bins, 80)))), peaks = new Array<number>(count).fill(0);
 for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
  const samples = buffer.getChannelData(channel);
  for (let i = 0; i < samples.length; i++) {
   const at = Math.min(count - 1, Math.floor(i * count / samples.length));
   peaks[at] = Math.max(peaks[at], Math.min(1, Math.abs(finite(samples[i]))));
  }
 }
 return peaks;
}
