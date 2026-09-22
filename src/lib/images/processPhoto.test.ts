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
  private context: FakeCanvasContext | null = null;
  // Every canvas created during a test is recorded here so assertions can find the
  // specific patch canvas processPhoto creates for a blurred region, in addition to
  // the main canvas. getContext() caches the context per instance (like the real
  // OffscreenCanvas API) so a canvas's draw calls can be inspected after the fact.
  static instances: FakeOffscreenCanvas[] = [];
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    FakeOffscreenCanvas.instances.push(this);
  }
  getContext() {
    if (!this.context) {
      this.context = new FakeCanvasContext(this);
    }
    return this.context;
  }
  convertToBlob({ type }: { type: string; quality: number }) {
    return Promise.resolve(new Blob(['fake-bytes'], { type }));
  }
}

beforeEach(() => {
  FakeOffscreenCanvas.instances = [];
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

  it('blurs a detected face region via a separate patch canvas', async () => {
    const { detectFaceRegions } = await import('./faceBlur');
    // Resized canvas is 1600x1200 (3200x2400 scaled to the 1600px long edge).
    // padding = round(max(200, 200) * 0.25) = 50
    // patch x/y = 100 - 50 = 50; patch w/h = min(canvas - 50, 200 + 100) = 300
    vi.mocked(detectFaceRegions).mockResolvedValueOnce([{ x: 100, y: 100, width: 200, height: 200 }]);
    const { processPhoto } = await import('./processPhoto');
    const result = await processPhoto(new Blob(['input'], { type: 'image/jpeg' }));

    expect(result.blurred).toBe(true);

    const mainCanvas = FakeOffscreenCanvas.instances.find(
      (c) => c.width === 1600 && c.height === 1200
    );
    const patchCanvas = FakeOffscreenCanvas.instances.find(
      (c) => c.width === 300 && c.height === 300
    );
    expect(mainCanvas).toBeDefined();
    expect(patchCanvas).toBeDefined();

    const patchCtx = patchCanvas!.getContext();
    expect(patchCtx.filter).toBe('blur(12px)');
    expect(patchCtx.drawImage).toHaveBeenCalledWith(mainCanvas, 50, 50, 300, 300, 0, 0, 300, 300);

    const mainCtx = mainCanvas!.getContext();
    expect(mainCtx.drawImage).toHaveBeenCalledWith(patchCanvas, 50, 50);
  });

  it('reports blurred:false, without throwing, when a region falls outside the resized canvas bounds', async () => {
    const { detectFaceRegions } = await import('./faceBlur');
    // Padded box (x=1650-25=1625) falls entirely past the 1600px-wide resized canvas,
    // so the computed patch width is negative and no blur can be drawn.
    vi.mocked(detectFaceRegions).mockResolvedValueOnce([{ x: 1650, y: 100, width: 100, height: 100 }]);
    const { processPhoto } = await import('./processPhoto');
    const result = await processPhoto(new Blob(['input'], { type: 'image/jpeg' }));

    expect(result.blurred).toBe(false);
    expect(result.blob).toBeInstanceOf(Blob);
  });
});
