import { describe, it, expect, beforeEach } from 'vitest';
import { loadAppearance, saveAppearance } from './appearance';

beforeEach(() => localStorage.clear());

describe('map appearance', () => {
  it('defaults to the satellite view', () => {
    expect(loadAppearance()).toEqual({ styleId: 'satellite' });
  });

  it('remembers the chosen view across loads', () => {
    saveAppearance({ styleId: 'light' });
    expect(loadAppearance()).toEqual({ styleId: 'light' });
  });

  it('ignores corrupt stored values', () => {
    localStorage.setItem('civicly-map-style', 'nope');
    expect(loadAppearance().styleId).toBe('satellite');
  });
});
