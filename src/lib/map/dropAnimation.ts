// Timing for the Discovery map's "pins drop in from the top, one by one" intro. Pure
// functions of elapsed time so they're easy to test; MapView feeds the result into the
// pin layer's data-driven icon-offset / opacity on every animation frame.

export const DROP_DURATION_MS = 750;
const DROP_HEIGHT_PX = 320;
const STAGGER_MS = 140;
// However many pins there are, the whole sequence's stagger never exceeds this.
const MAX_TOTAL_STAGGER_MS = 3000;

export function dropDelayMs(index: number, total: number): number {
  const step = Math.min(STAGGER_MS, MAX_TOTAL_STAGGER_MS / Math.max(total, 1));
  return index * step;
}

// Ease-out with a small bounce at the end, like a pin landing.
function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/** Vertical offset (px, negative = above its spot) and opacity for the pin at `index`
 * of `total`, `elapsedMs` after the sequence started. */
export function dropState(index: number, elapsedMs: number, total: number): { offsetY: number; opacity: number } {
  const t = elapsedMs - dropDelayMs(index, total);
  if (t <= 0) return { offsetY: -DROP_HEIGHT_PX, opacity: 0 };
  if (t >= DROP_DURATION_MS) return { offsetY: 0, opacity: 1 };
  const progress = easeOutBounce(t / DROP_DURATION_MS);
  return { offsetY: -DROP_HEIGHT_PX * (1 - progress), opacity: Math.min(1, t / 120) };
}
