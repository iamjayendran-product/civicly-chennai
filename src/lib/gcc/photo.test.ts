// @vitest-environment node
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { GCC_MAX_IMAGE_BYTES, toGccImageDataUrl } from './photo';

function decodedSize(dataUrl: string) {
  return Buffer.from(dataUrl.split(',')[1], 'base64').length;
}

async function noiseJpeg(size: number, quality: number) {
  const raw = Buffer.alloc(size * size * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
  return new Uint8Array(await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality }).toBuffer());
}

describe('toGccImageDataUrl', () => {
  it('passes a small JPEG through as a data URL', async () => {
    const small = await noiseJpeg(200, 80);
    const url = await toGccImageDataUrl(small);
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(decodedSize(url)).toBe(small.length);
  });

  it('re-encodes a photo over GCC’s 1 MB limit until it fits', async () => {
    const big = await noiseJpeg(1600, 95);
    expect(big.length).toBeGreaterThan(GCC_MAX_IMAGE_BYTES);
    const url = await toGccImageDataUrl(big);
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(decodedSize(url)).toBeLessThanOrEqual(GCC_MAX_IMAGE_BYTES);
  }, 30_000);
});
