import { describe, it, expect } from 'vitest';
import { computeResizedDimensions, MAX_LONG_EDGE } from './resize';

describe('computeResizedDimensions', () => {
  it('leaves an image alone if its long edge is already within the max', () => {
    expect(computeResizedDimensions(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('scales a landscape image down so its long edge is exactly the max', () => {
    expect(computeResizedDimensions(3200, 2400)).toEqual({ width: MAX_LONG_EDGE, height: 1200 });
  });

  it('scales a portrait image down so its long edge is exactly the max', () => {
    expect(computeResizedDimensions(2400, 3200)).toEqual({ width: 1200, height: MAX_LONG_EDGE });
  });
});
