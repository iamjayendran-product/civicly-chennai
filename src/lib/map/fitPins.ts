import type { LngLatBoundsLike, Map as MapLibreMap, PaddingOptions } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';

export interface PinFrameInput {
  /** Map container size in CSS px. */
  width: number;
  height: number;
  /** Height of the filter/search header overlaying the top of the map. */
  topInset: number;
}

// Room for a pin's own height (it hangs above its point) plus a little breathing space.
const PIN_CLEARANCE = 44;
// The "Report a Grievance" button and the attribution strip along the bottom, on a tall
// screen; on a short one (landscape phone) it shrinks so it doesn't swallow the map.
const BOTTOM_CONTROLS_MAX = 150;
const BOTTOM_CONTROLS_MIN = 72;

/** Screen insets that keep every pin out from under the overlays, scaled to the device:
 * side margins grow with width (capped), the bottom inset shrinks on short screens, and
 * the top always clears the header plus a pin's own height (pins hang above their point). */
export function pinFramePadding({ width, height, topInset }: PinFrameInput): PaddingOptions {
  const side = Math.round(Math.min(40, Math.max(16, width * 0.06)));
  const bottom = Math.round(Math.min(BOTTOM_CONTROLS_MAX, Math.max(BOTTOM_CONTROLS_MIN, height * 0.18)));
  return { top: topInset + PIN_CLEARANCE, bottom, left: side, right: side };
}

/** The few camera operations the refinement loop needs; a real MapLibre map is adapted
 * to this in `fitCameraToPins`, and tests use a tiny fake. */
export interface FitCamera {
  size: { width: number; height: number };
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  /** Screen position of a point under the camera's current pitch/bearing. */
  project: (lng: number, lat: number) => { x: number; y: number };
  /** Moves the view so what is at (dx, dy) px from the screen centre becomes the centre. */
  panByPixels: (dx: number, dy: number) => void;
}

// Below this container height (a landscape phone) a steep 3D tilt leaves too little
// room to show every pin, so the tilt is eased down while framing.
const SHORT_SCREEN_PX = 500;
const SHORT_SCREEN_PITCH = 30;
const MAX_FIT_STEPS = 60;
const ZOOM_OUT_STEP = 0.1;

/** Pans and zooms out until every point projects inside the padded screen area. Done by
 * measuring real screen positions, because the stock fitBounds ignores how a tilted (3D)
 * view squeezes the far side of the map and leaves pins off-screen. */
export function fitPinsInView(camera: FitCamera, points: { lng: number; lat: number }[], padding: Partial<PaddingOptions>): void {
  const { width, height } = camera.size;
  const area = {
    left: padding.left ?? 0,
    right: width - (padding.right ?? 0),
    top: padding.top ?? 0,
    bottom: height - (padding.bottom ?? 0),
  };
  const centreX = (area.left + area.right) / 2;
  const centreY = (area.top + area.bottom) / 2;

  for (let step = 0; step < MAX_FIT_STEPS; step++) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      const { x, y } = camera.project(point.lng, point.lat);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const fits = minX >= area.left && maxX <= area.right && minY >= area.top && maxY <= area.bottom;
    if (fits) return;

    // Recentre the pins' on-screen extent in the safe area, then back off a little if
    // the extent is still bigger than that area.
    const dx = (minX + maxX) / 2 - centreX;
    const dy = (minY + maxY) / 2 - centreY;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) camera.panByPixels(dx, dy);
    if (maxX - minX > area.right - area.left || maxY - minY > area.bottom - area.top || step > 2) {
      camera.setZoom(camera.getZoom() - ZOOM_OUT_STEP);
    }
  }
}

/** Frames every point on screen for this device, with no animation. Zoom is capped so a
 * single pin doesn't zoom absurdly far in. */
export function fitCameraToPins(map: MapLibreMap, points: { lng: number; lat: number }[], topInset: number): void {
  if (points.length === 0) return;
  const container = map.getContainer();
  const padding = pinFramePadding({ width: container.clientWidth, height: container.clientHeight, topInset });
  if (container.clientHeight < SHORT_SCREEN_PX && map.getPitch() > SHORT_SCREEN_PITCH) map.setPitch(SHORT_SCREEN_PITCH);
  // Rough placement first (also sets a sensible zoom), then the measured refinement.
  const bounds = new maplibregl.LngLatBounds();
  for (const point of points) bounds.extend([point.lng, point.lat]);
  map.fitBounds(bounds as LngLatBoundsLike, { padding, maxZoom: 14, duration: 0 });
  fitPinsInView(
    {
      size: { width: container.clientWidth, height: container.clientHeight },
      getZoom: () => map.getZoom(),
      setZoom: (zoom) => map.jumpTo({ zoom }),
      project: (lng, lat) => map.project([lng, lat]),
      panByPixels: (dx, dy) => map.panBy([dx, dy], { duration: 0 }),
    },
    points,
    padding
  );
}
