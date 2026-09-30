import { describe, it, expect } from 'vitest';
import { MAP_COLORS } from './colors';

describe('MAP_COLORS', () => {
  it('mirrors globals.css light-mode tokens for the literal colors MapLibre paint properties need', () => {
    expect(MAP_COLORS.pothole).toBe('#ff3b30');
    expect(MAP_COLORS.waterlogging).toBe('#007aff');
    expect(MAP_COLORS.other).toBe('#d4a72c');
    expect(MAP_COLORS.fixed).toBe('#8e8e93');
  });

  it('exposes a single value for each color exactly once', () => {
    const values = Object.values(MAP_COLORS);
    expect(new Set(values).size).toBe(values.length);
  });
});
