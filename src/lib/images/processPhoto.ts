import { computeResizedDimensions } from './resize';
import { detectFaceRegions, type BlurRegion } from './faceBlur';

export interface ProcessedPhoto {
  blob: Blob;
  /** false if face detection failed and the photo was uploaded unblurred. */
  blurred: boolean;
  width: number;
  height: number;
}

const JPEG_QUALITY = 0.8;
const BLUR_PADDING_RATIO = 0.25;
const BLUR_PIXELS = 12;

export async function processPhoto(file: File | Blob): Promise<ProcessedPhoto> {
  const oriented = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const { width, height } = computeResizedDimensions(oriented.width, oriented.height);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error('2D canvas context is unavailable in this browser');
  }
  ctx.drawImage(oriented, 0, 0, width, height);
  oriented.close();

  let blurred = true;
  try {
    const resizedBitmap = await createImageBitmap(canvas as unknown as ImageBitmapSource);
    const regions = await detectFaceRegions(resizedBitmap);
    for (const region of regions) {
      blurRegion(ctx, region);
    }
  } catch {
    blurred = false;
  }

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  return { blob, blurred, width, height };
}

function blurRegion(ctx: OffscreenCanvasRenderingContext2D, region: BlurRegion) {
  const padding = Math.round(Math.max(region.width, region.height) * BLUR_PADDING_RATIO);
  const x = Math.max(0, Math.round(region.x - padding));
  const y = Math.max(0, Math.round(region.y - padding));
  const w = Math.min(ctx.canvas.width - x, Math.round(region.width + padding * 2));
  const h = Math.min(ctx.canvas.height - y, Math.round(region.height + padding * 2));
  if (w <= 0 || h <= 0) return;

  const patch = new OffscreenCanvas(w, h);
  const patchCtx = patch.getContext('2d');
  if (!patchCtx) return;
  patchCtx.filter = `blur(${BLUR_PIXELS}px)`;
  patchCtx.drawImage(ctx.canvas, x, y, w, h, 0, 0, w, h);
  ctx.drawImage(patch, x, y);
}
