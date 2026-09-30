// MapLibre paint/icon properties take literal color values, not CSS custom
// properties, so they can't reference globals.css's tokens directly. This is the one
// place that mirrors those tokens as literals — every other map file imports from
// here instead of hard-coding its own hex copy, so there's a single spot to update
// if globals.css's light-mode tokens ever change.
export const MAP_COLORS = {
  pothole: '#ff3b30', // --brand-primary
  waterlogging: '#007aff', // --brand-secondary
  other: '#d4a72c', // mustard, distinct from both brand tokens
  fixed: '#8e8e93', // --muted
} as const;
