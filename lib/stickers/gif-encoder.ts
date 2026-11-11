import {GIFEncoder, quantize, applyPalette} from 'gifenc';
import {GIF_EXPORT_LIMITS, GifExportError} from './gif-export-core';

/** One indexed frame and its small palette at a time, never a frame collection. */
export function createGifFrameEncoder(width: number, height: number, repeat = 0) {
  if (width <= 0 || height <= 0 || width * height > GIF_EXPORT_LIMITS.outputSize ** 2) throw new GifExportError('too-large');
  const encoder = GIFEncoder({initialCapacity: 64 * 1024});let frames = 0;
  return {
    add(rgba: Uint8ClampedArray | Uint8Array, delayCs: number) {
      if (rgba.length !== width * height * 4 || !Number.isInteger(delayCs) || delayCs < 1 || delayCs > 65535) throw new GifExportError('invalid');
      // Index zero is reserved for transparency. An opaque black pixel gets its
      // own palette entry, so it cannot become transparent after quantization.
      for (let at = 0; at < rgba.length; at += 4) if (rgba[at + 3] < 128) { rgba[at] = rgba[at + 1] = rgba[at + 2] = 0;rgba[at + 3] = 0; }
      const colors = quantize(rgba, 255, {format: 'rgb565'}), palette = [[0, 0, 0], ...colors], index = applyPalette(rgba, colors, 'rgb565');
      for (let pixel = 0; pixel < index.length; pixel++) index[pixel] = rgba[pixel * 4 + 3] < 128 ? 0 : index[pixel] + 1;
      encoder.writeFrame(index, width, height, {palette, delay: delayCs * 10, repeat, transparent: true, transparentIndex: 0, dispose: 2});frames++;
      if (encoder.bytesView().length > GIF_EXPORT_LIMITS.outputBytes || frames > GIF_EXPORT_LIMITS.frames) throw new GifExportError('output');
    },
    finish(): Blob {
      if (!frames) throw new GifExportError('not-animated');
      encoder.finish();
      if (encoder.bytesView().length > GIF_EXPORT_LIMITS.outputBytes) throw new GifExportError('output');
      return new Blob([encoder.bytesView() as BlobPart], {type: 'image/gif'});
    },
  };
}
