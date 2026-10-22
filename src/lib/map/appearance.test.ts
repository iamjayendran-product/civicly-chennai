import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppearance, saveAppearance } from './appearance';

beforeEach(() => localStorage.clear());

describe('map appearance', () => {
  it('defaults to the light Map view', () => {
    expect(loadAppearance()).toEqual({ styleId: 'light' });
  });

  it('remembers the chosen view across loads', () => {
    saveAppearance({ styleId: 'dark' });
    expect(loadAppearance()).toEqual({ styleId: 'dark' });
  });

  it('ignores corrupt stored values', () => {
    localStorage.setItem('civicly-map-style', 'nope');
    expect(loadAppearance().styleId).toBe('light');
  });
});
