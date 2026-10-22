import { describe, it, expect } from 'vitest';
import { MAP_STYLES, DEFAULT_MAP_STYLE_ID, getMapStyle } from './styles';

describe('map styles', () => {
  it('offers Map in a light or dark theme, and Satellite', () => {
    expect(MAP_STYLES.map((s) => s.id)).toEqual(['light', 'dark', 'satellite']);
  });

  it('opens in the light Map view by default', () => {
    expect(DEFAULT_MAP_STYLE_ID).toBe('light');
  });

  it('falls back to the default for views that are no longer offered', () => {
    expect(getMapStyle('terrain').id).toBe(DEFAULT_MAP_STYLE_ID);
  });

  it('falls back to the default for unknown ids', () => {
    expect(getMapStyle('nope').id).toBe(DEFAULT_MAP_STYLE_ID);
    expect(getMapStyle(null).id).toBe(DEFAULT_MAP_STYLE_ID);
  });

  it('gives raster styles a glyphs URL so report-count labels still render', () => {
    for (const id of ['satellite']) {
      const style = getMapStyle(id).style;
      expect(typeof style).toBe('object');
      expect((style as { glyphs?: string }).glyphs).toContain('{fontstack}');
    }
  });
});
