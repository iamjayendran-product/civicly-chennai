import { describe, it, expect } from 'vitest';
import { dropDelayMs, dropState, DROP_DURATION_MS } from './dropAnimation';

describe('pin drop animation', () => {
  it('staggers pins one by one, but caps the total so big sets still finish quickly', () => {
    expect(dropDelayMs(0, 10)).toBe(0);
    expect(dropDelayMs(1, 10)).toBeGreaterThan(0);
    expect(dropDelayMs(999, 1000)).toBeLessThanOrEqual(3000);
  });

  it('keeps a pin hidden above the map before its turn', () => {
    const s = dropState(5, 500, 10); // pin #5 waits 700ms
    expect(s.opacity).toBe(0);
  });

  it('starts high, lands exactly at the spot and is fully visible when done', () => {
    const start = dropState(0, 0, 1);
    expect(start.offsetY).toBeLessThan(-100);
    const end = dropState(0, DROP_DURATION_MS + 1, 1);
    expect(end).toEqual({ offsetY: 0, opacity: 1 });
  });

  it('never dips below the target (offsetY <= 0) while bouncing', () => {
    for (let t = 0; t <= DROP_DURATION_MS; t += 25) {
      expect(dropState(0, t, 1).offsetY).toBeLessThanOrEqual(0);
    }
  });
});
