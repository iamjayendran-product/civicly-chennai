import { describe, it, expect } from 'vitest';
import { CMDA_BBOX, CMDA_CENTER, CMDA_MAX_BOUNDS, boundsToBboxParams } from './cmda';

describe('CMDA constants', () => {
  it('CMDA_CENTER sits inside CMDA_BBOX', () => {
    expect(CMDA_CENTER.lng).toBeGreaterThan(CMDA_BBOX.minLng);
    expect(CMDA_CENTER.lng).toBeLessThan(CMDA_BBOX.maxLng);
    expect(CMDA_CENTER.lat).toBeGreaterThan(CMDA_BBOX.minLat);
    expect(CMDA_CENTER.lat).toBeLessThan(CMDA_BBOX.maxLat);
  });

  it('CMDA_MAX_BOUNDS matches [[minLng,minLat],[maxLng,maxLat]]', () => {
    expect(CMDA_MAX_BOUNDS).toEqual([
      [CMDA_BBOX.minLng, CMDA_BBOX.minLat],
      [CMDA_BBOX.maxLng, CMDA_BBOX.maxLat],
    ]);
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
