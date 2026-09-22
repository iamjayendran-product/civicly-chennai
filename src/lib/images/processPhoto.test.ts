import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./faceBlur', () => ({
  detectFaceRegions: vi.fn().mockResolvedValue([]),
}));

class FakeCanvasContext {
  canvas: FakeOffscreenCanvas;
  filter = 'none';
  constructor(canvas: FakeOffscreenCanvas) {
    this.canvas = canvas;
  }
  drawImage = vi.fn();
  save = vi.fn();
  restore = vi.fn();
}

class FakeOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return new FakeCanvasContext(this);
  }
  convertToBlob({ type }: { type: string; quality: number }) {
    return Promise.resolve(new Blob(['fake-bytes'], { type }));
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ width: 3200, height: 2400, close: vi.fn() })
  );
});

describe('processPhoto', () => {
  it('resizes to fit within the 1600px long edge and re-encodes as JPEG', async () => {
    const { processPhoto } = await import('./processPhoto');
    const result = await processPhoto(new Blob(['input'], { type: 'image/jpeg' }));
    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.blob.type).toBe('image/jpeg');
    expect(result.blurred).toBe(true);
  });

  it('sets blurred:false without throwing when face detection fails', async () => {
    const { detectFaceRegions } = await import('./faceBlur');
    vi.mocked(detectFaceRegions).mockRejectedValueOnce(new Error('model failed to load'));
    const { processPhoto } = await import('./processPhoto');
    const result = await processPhoto(new Blob(['input'], { type: 'image/jpeg' }));
    expect(result.blurred).toBe(false);
    expect(result.blob).toBeInstanceOf(Blob);
  });
});
