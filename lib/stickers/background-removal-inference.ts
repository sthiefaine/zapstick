import {Tensor, type InferenceSession} from 'onnxruntime-web/wasm';
import {backgroundAlpha, prepareBackgroundTensor, BackgroundRemovalError} from './background-removal-core';

/** Reuses the same input/mask/output surfaces for all frames of one job. The
 * caller owns the single session and consumes the returned surface before reuse. */
export function createBackgroundFrameProcessor(session: Pick<InferenceSession, 'inputNames' | 'outputNames' | 'run'>, width: number, height: number) {
  const output = new OffscreenCanvas(width, height), context = output.getContext('2d');
  const inputCanvas = new OffscreenCanvas(320, 320), inputContext = inputCanvas.getContext('2d', {willReadFrequently: true});
  const maskCanvas = new OffscreenCanvas(320, 320), maskContext = maskCanvas.getContext('2d');
  if (!context || !inputContext || !maskContext) throw new BackgroundRemovalError('unsupported');
  const maskBytes = new Uint8ClampedArray(320 * 320 * 4), maskImage = new ImageData(maskBytes, 320, 320);
  return {
    async process(source: CanvasImageSource): Promise<OffscreenCanvas> {
      context.globalCompositeOperation = 'source-over';context.clearRect(0, 0, width, height);context.drawImage(source, 0, 0, width, height);
      inputContext.clearRect(0, 0, 320, 320);inputContext.drawImage(output, 0, 0, 320, 320);
      const rgba = inputContext.getImageData(0, 0, 320, 320).data;
      // Empty frames are meaningful in animations. Keep them transparent rather
      // than asking the model to normalize a constant empty prediction.
      let visible = false;for (let at = 3; at < rgba.length; at += 4) if (rgba[at]) {visible = true;break;}
      if (!visible) return output;
      const input = new Tensor('float32', prepareBackgroundTensor(rgba), [1, 3, 320, 320]);
      let result: Record<string, Tensor> | undefined;
      try {
        result = await session.run({[session.inputNames[0]]: input}, [session.outputNames[0]]);
        const prediction = result[session.outputNames[0]];
        if (!(prediction?.data instanceof Float32Array) || prediction.data.length !== 320 * 320) throw new BackgroundRemovalError('model');
        backgroundAlpha(prediction.data, maskBytes);maskContext.putImageData(maskImage, 0, 0);
        context.globalCompositeOperation = 'destination-in';context.imageSmoothingEnabled = true;context.imageSmoothingQuality = 'high';context.drawImage(maskCanvas, 0, 0, width, height);
        context.globalCompositeOperation = 'source-over';
        return output;
      } finally {
        input.dispose();
        for (const tensor of new Set(Object.values(result ?? {}))) tensor.dispose();
      }
    },
    dispose() {output.width = output.height = inputCanvas.width = inputCanvas.height = maskCanvas.width = maskCanvas.height = 0;},
  };
}
