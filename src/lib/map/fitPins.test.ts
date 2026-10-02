import { describe, it, expect } from 'vitest';
import { fitPinsInView, pinFramePadding } from './fitPins';

describe('pinFramePadding', () => {
  it('keeps pins clear of the header and the bottom button on a phone', () => {
    const p = pinFramePadding({ width: 390, height: 844, topInset: 110 });
    expect(p.top).toBeGreaterThan(110); // below the filter/search header
    expect(p.bottom).toBeGreaterThanOrEqual(130); // above the Report button + attribution
    expect(p.left).toBeGreaterThan(0);
    expect(p.left).toBe(p.right);
  });

  it('never lets the insets swallow a short landscape screen', () => {
    const p = pinFramePadding({ width: 844, height: 390, topInset: 110 });
    expect((p.top ?? 0) + (p.bottom ?? 0)).toBeLessThan(390 * 0.7);
    expect(p.top).toBeGreaterThan(110); // still below the header
  });

  it('scales side margins with the screen but stays bounded', () => {
    expect(pinFramePadding({ width: 320, height: 568, topInset: 100 }).left).toBeLessThanOrEqual(40);
    expect(pinFramePadding({ width: 1920, height: 1080, topInset: 100 }).left).toBeLessThanOrEqual(40);
  });
});

describe('fitPinsInView', () => {
  // A tiny stand-in camera: linear projection around a centre, zoom doubles the scale.
  function fakeMap(width: number, height: number) {
    const state = { cx: 0, cy: 0, zoom: 12 };
    const scale = () => 2 ** state.zoom * 0.05;
    return {
      state,
      getZoom: () => state.zoom,
      setZoom: (z: number) => void (state.zoom = z),
      project: (lng: number, lat: number) => ({ x: width / 2 + (lng - state.cx) * scale(), y: height / 2 - (lat - state.cy) * scale() }),
      panByPixels: (dx: number, dy: number) => {
        state.cx += dx / scale();
        state.cy -= dy / scale();
      },
      size: { width, height },
    };
  }

  it('zooms out and recentres until every pin is inside the padded area', () => {
    const map = fakeMap(390, 844);
    const pins = [
      { lng: -3, lat: 5 },
      { lng: 4, lat: -6 },
      { lng: 1, lat: 0 },
    ];
    const padding = { top: 150, bottom: 150, left: 24, right: 24 };
    fitPinsInView(map, pins, padding);
    for (const pin of pins) {
      const pt = map.project(pin.lng, pin.lat);
      expect(pt.x).toBeGreaterThanOrEqual(padding.left);
      expect(pt.x).toBeLessThanOrEqual(390 - padding.right);
      expect(pt.y).toBeGreaterThanOrEqual(padding.top);
      expect(pt.y).toBeLessThanOrEqual(844 - padding.bottom);
    }
  });

  it('leaves an already-fitting view alone', () => {
    const map = fakeMap(390, 844);
    map.setZoom(4);
    const before = { ...map.state };
    fitPinsInView(map, [{ lng: 0, lat: 0 }], { top: 100, bottom: 100, left: 20, right: 20 });
    expect(map.state).toEqual(before);
  });
});
