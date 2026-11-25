import { registerAudioWork } from './audio';

export type MicrophoneState = 'idle' | 'waiting' | 'recording';
type Callbacks = { onState?: (state: MicrophoneState) => void; onElapsed?: (seconds: number) => void };
export type MicrophoneSession = { record: (signal?: AbortSignal) => Promise<Blob>; stop: () => void; cancel: () => void };
const abortError = () => new DOMException('Aborted', 'AbortError');
function microphoneError(error: unknown): Error {
 const name = error instanceof Error || typeof error === 'object' && error !== null && 'name' in error ? (error as { name: string }).name : '';
 if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return new Error('Autorise le microphone pour enregistrer un son.');
 if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return new Error('Aucun microphone disponible.');
 return new Error('Le microphone est indisponible. Réessaie.');
}

/** Construction never requests permission. Only an explicit call to record does. */
export function createMicrophoneSession(callbacks: Callbacks = {}): MicrophoneSession {
 let active: { stop: () => void; cancel: () => void } | undefined;
 return {
  record(signal) {
   if (active) return Promise.reject(new Error('Un enregistrement est déjà en cours.'));
   if (signal?.aborted || typeof document !== 'undefined' && document.hidden) return Promise.reject(abortError());
   if (typeof window === 'undefined' || !window.isSecureContext) return Promise.reject(new Error('L’enregistrement audio nécessite une connexion sécurisée.'));
   if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return Promise.reject(new Error('L’enregistrement audio est indisponible dans ce navigateur.'));
   return new Promise<Blob>((resolve, reject) => {
    let settled = false, stream: MediaStream | undefined, recorder: MediaRecorder | undefined;
    let chunks: Blob[] = [], bytes = 0, began: number | null = null, stopping = false;
    let deadline: ReturnType<typeof setTimeout> | undefined, elapsedTimer: ReturnType<typeof setInterval> | undefined;
    const state = (value: MicrophoneState) => { try { callbacks.onState?.(value); } catch { /* UI observers must not retain a microphone. */ } };
    const elapsed = (value: number) => { try { callbacks.onElapsed?.(value); } catch { /* UI observers are optional. */ } };
    const cleanup = () => {
     clearTimeout(deadline); clearInterval(elapsedTimer); unregister();
     signal?.removeEventListener('abort', cancel);
     document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', cancel);
     if (recorder) { recorder.onstart = recorder.ondataavailable = recorder.onstop = recorder.onerror = null; }
     if (recorder && recorder.state !== 'inactive') { try { recorder.stop(); } catch { /* Already stopped by the browser. */ } }
     for (const track of stream?.getTracks() ?? []) track.stop();
     chunks = []; if (active?.cancel === cancel) active = undefined;
     state('idle');
    };
    const finish = (error?: Error) => {
     if (settled) return;
     settled = true;
     const blob = !error && chunks.length ? new Blob(chunks, { type: recorder?.mimeType || chunks.find(chunk => chunk.type)?.type || 'application/octet-stream' }) : undefined;
     cleanup();
     if (error) reject(error);
     else if (!blob?.size) reject(new Error('Aucun son détecté dans ce média.'));
     else resolve(blob);
    };
    function cancel() { finish(abortError()); }
    function hidden() { if (document.hidden) cancel(); }
    function stop() {
     if (settled || stopping) return;
     if (!recorder || began === null || recorder.state === 'inactive') { cancel(); return; }
     stopping = true; clearTimeout(deadline); clearInterval(elapsedTimer);
     elapsed(Math.min(6, (performance.now() - began) / 1000));
     if (settled) return;
     try { recorder.stop(); } catch { finish(microphoneError(undefined)); return; }
     // Stop capture immediately, while retaining the recorder's final data/stop handlers.
     for (const track of stream?.getTracks() ?? []) track.stop();
     deadline = setTimeout(() => finish(microphoneError(undefined)), 5000);
    }
    active = { stop, cancel }; const unregister = registerAudioWork(cancel);
    signal?.addEventListener('abort', cancel, { once: true });
    document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', cancel);
    state('waiting'); elapsed(0);
    if (settled || signal?.aborted || document.hidden) { cancel(); return; }
    // Permission may be answered after cancellation; its stream must still be released.
    let permission: Promise<MediaStream>;
    try { permission = navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (error) { finish(microphoneError(error)); return; }
    permission.then(value => {
     if (settled) { for (const track of value.getTracks()) track.stop(); return; }
     stream = value;
     if (signal?.aborted || document.hidden) { cancel(); return; }
     try {
      const mime = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 96000 }) : new MediaRecorder(stream);
      recorder.ondataavailable = event => {
       if (settled || !event.data.size) return;
       bytes += event.data.size;
       if (bytes > 5 * 1024 * 1024) { finish(new Error('Choisis un fichier audio de moins de 5 Mo.')); return; }
       chunks.push(event.data);
      };
      recorder.onerror = () => finish(microphoneError(undefined));
      recorder.onstop = () => finish();
      recorder.onstart = () => {
       if (settled || stopping || began !== null) return;
       clearTimeout(deadline); began = performance.now();
       deadline = setTimeout(stop, 6000);
       elapsedTimer = setInterval(() => { const seconds = (performance.now() - began!) / 1000; elapsed(Math.min(6, seconds)); if (seconds >= 6) stop(); }, 100);
       state('recording');
      };
      // Starting the encoder is asynchronous; permission time is not recording time.
      deadline = setTimeout(() => finish(microphoneError(undefined)), 5000);
      recorder.start();
     } catch (error) { finish(microphoneError(error)); }
    }, error => { if (!settled) finish(microphoneError(error)); });
   });
  },
  stop() { active?.stop(); },
  cancel() { active?.cancel(); },
 };
}
