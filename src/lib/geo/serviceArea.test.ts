import { describe, it, expect } from 'vitest';
import {
  GCC_BBOX,
  GCC_BOUNDARY,
  GCC_CENTER,
  GCC_MAX_BOUNDS,
  boundsToBboxParams,
  isInServiceArea,
  padBounds,
} from './serviceArea';

describe('GCC constants', () => {
  it('GCC_BBOX is the bounding box of the GCC boundary polygon', () => {
    const ring = GCC_BOUNDARY.coordinates[0];
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    expect(GCC_BBOX).toEqual({
      minLng: Math.min(...lngs),
      minLat: Math.min(...lats),
      maxLng: Math.max(...lngs),
      maxLat: Math.max(...lats),
    });
  });

  it('GCC_CENTER sits inside GCC_BBOX', () => {
    expect(GCC_CENTER.lng).toBeGreaterThan(GCC_BBOX.minLng);
    expect(GCC_CENTER.lng).toBeLessThan(GCC_BBOX.maxLng);
    expect(GCC_CENTER.lat).toBeGreaterThan(GCC_BBOX.minLat);
    expect(GCC_CENTER.lat).toBeLessThan(GCC_BBOX.maxLat);
  });

  it('GCC_MAX_BOUNDS matches [[minLng,minLat],[maxLng,maxLat]]', () => {
    expect(GCC_MAX_BOUNDS).toEqual([
      [GCC_BBOX.minLng, GCC_BBOX.minLat],
      [GCC_BBOX.maxLng, GCC_BBOX.maxLat],
    ]);
  });
});

describe('isInServiceArea', () => {
  it('accepts points inside GCC limits', () => {
    expect(isInServiceArea(80.204032, 13.05202)).toBe(true); // Vadapalani
    expect(isInServiceArea(80.2716, 13.0819)).toBe(true); // Ripon Building
  });

  it('rejects CMDA points outside GCC limits', () => {
    expect(isInServiceArea(80.118, 12.9249)).toBe(false); // Tambaram
    expect(isInServiceArea(80.1013, 13.1147)).toBe(false); // Avadi
  });

  it('rejects points far away', () => {
    expect(isInServiceArea(72.8777, 19.076)).toBe(false); // Mumbai
  });
});

describe('boundsToBboxParams', () => {
  it('maps a MapLibre-like bounds object to RPC params', () => {
    const bounds = {
      getWest: () => 80.2,
      getSouth: () => 13.0,
      getEast: () => 80.3,
      getNorth: () => 13.1,
    };
    expect(boundsToBboxParams(bounds)).toEqual({
      minLng: 80.2,
      minLat: 13.0,
      maxLng: 80.3,
      maxLat: 13.1,
    });
  });
});

describe('padBounds', () => {
  it('grows the box by a fraction of its size on every side', () => {
    expect(padBounds([[0, 0], [10, 20]], 0.5)).toEqual([[-5, -10], [15, 30]]);
  });
  it('keeps the GCC box inside the padded one', () => {
    const [[w, s], [e, n]] = padBounds(GCC_MAX_BOUNDS, 0.4);
    expect(w).toBeLessThan(GCC_MAX_BOUNDS[0][0]);
    expect(s).toBeLessThan(GCC_MAX_BOUNDS[0][1]);
    expect(e).toBeGreaterThan(GCC_MAX_BOUNDS[1][0]);
    expect(n).toBeGreaterThan(GCC_MAX_BOUNDS[1][1]);
  });
});
