export const MAX_LONG_EDGE = 1600;

export function computeResizedDimensions(
  width: number,
  height: number,
  maxLongEdge: number = MAX_LONG_EDGE
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxLongEdge) {
    return { width, height };
  }
  const scale = maxLongEdge / longEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
