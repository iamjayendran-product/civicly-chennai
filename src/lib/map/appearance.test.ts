import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppearance, saveAppearance, PITCH_3D } from './appearance';

describe('map appearance persistence', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the light 2D view', () => {
    expect(loadAppearance()).toEqual({ styleId: 'light', is3d: false });
  });

  it('remembers the chosen view and 3D flag across loads', () => {
    saveAppearance({ styleId: 'satellite' });
    saveAppearance({ is3d: true });
    expect(loadAppearance()).toEqual({ styleId: 'satellite', is3d: true });
  });

  it('ignores corrupt stored values', () => {
    localStorage.setItem('civicly-map-style', 'bogus');
    localStorage.setItem('civicly-map-3d', 'maybe');
    expect(loadAppearance()).toEqual({ styleId: 'light', is3d: false });
  });

  it('tilts to a sensible pitch in 3D', () => {
    expect(PITCH_3D).toBeGreaterThan(30);
    expect(PITCH_3D).toBeLessThanOrEqual(60);
  });
});
