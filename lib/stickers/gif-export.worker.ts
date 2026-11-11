import {createGifFrameEncoder} from './gif-encoder';
import {GIF_EXPORT_LIMITS, GifExportError, gifCentisecondDelays, gifRepeatFromWebp, inspectGifAnimation, isGifBytes, type GifExportErrorCode} from './gif-export-core';
import {decodeWebpFrames, parseWebpAnimation, supportsNativeWebpDecoder, type WebpAnimation} from './webp-animation';

const scope = globalThis as unknown as {onmessage: ((event: MessageEvent<{blob: Blob}>) => void) | null; postMessage: (message: unknown) => void};
async function encodeWebp(bytes: Uint8Array, animation: WebpAnimation, strategy: 'native' | 'bitmap'): Promise<Blob> {
  const delays = gifCentisecondDelays(animation.frames.map(frame => frame.durationMs));
  let encoder: ReturnType<typeof createGifFrameEncoder> | undefined;
  for await (const frame of decodeWebpFrames(bytes, animation, {strategy})) {
    encoder ??= createGifFrameEncoder(frame.width, frame.height, gifRepeatFromWebp(animation.loopCount));
    const context = frame.canvas.getContext('2d', {willReadFrequently: true});
    if (!context) throw new GifExportError('unsupported');
    encoder.add(context.getImageData(0, 0, frame.width, frame.height).data, delays[frame.index]);
    scope.postMessage({type: 'progress', percent: Math.round((frame.index + 1) / animation.frames.length * 98)});
  }
  if (!encoder) throw new GifExportError('not-animated');
  return encoder.finish();
}
scope.onmessage = async ({data: {blob}}) => {
  try {
    if (blob.size > GIF_EXPORT_LIMITS.inputBytes) throw new GifExportError('too-large');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (isGifBytes(bytes)) {
      inspectGifAnimation(bytes);
      if (blob.size > GIF_EXPORT_LIMITS.outputBytes) throw new GifExportError('output');
      scope.postMessage({type: 'result', blob: new Blob([blob], {type: 'image/gif'})});return;
    }
    const animation = parseWebpAnimation(bytes);
    let result: Blob | undefined;
    if (await supportsNativeWebpDecoder()) {
      try { result = await encodeWebp(bytes, animation, 'native'); }
      catch (error) {
        if (error instanceof GifExportError && error.code !== 'decode' && error.code !== 'unsupported') throw error;
        // A native decoder can exist but reject a particular file. Start a fresh
        // encoder for the bitmap fallback so no already-written frame is doubled.
      }
    }
    result ??= await encodeWebp(bytes, animation, 'bitmap');
    scope.postMessage({type: 'result', blob: result});
  } catch (error) {
    const code: GifExportErrorCode = error instanceof GifExportError ? error.code : 'decode';
    scope.postMessage({type: 'error', code});
  }
};
