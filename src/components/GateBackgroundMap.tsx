'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER } from '@/lib/geo/cmda';
import { configureMaplibreWorker } from '@/lib/map/setupWorker';
import { getMapStyle } from '@/lib/map/styles';

configureMaplibreWorker();

const SPACE_VIEW = { center: [78.5, 18] as [number, number], zoom: 0.7 };
const CHENNAI_ZOOM = 11;
// Shifts the map's focal point up so Chennai (and its pin) lands above the logo and
// title instead of directly behind them.
const FOCAL_PADDING = { top: 0, bottom: 360, left: 0, right: 0 };
const INTRO_DELAY_MS = 700;
const FLY_DURATION_MS = 7000;

/** Purely decorative backdrop for the entry gate — the real, interactive map with its
 * controls and data (and full attribution) lives in MapView, which doesn't mount until
 * the gate is passed. `interactive: false` strips all pan/zoom/rotate gestures so this
 * never competes with the gate's own tap targets.
 *
 * `attributionControl: false`: MapLibre's attribution control sets its own `z-index: 2`
 * from inside a `position: relative` container that establishes no stacking context of
 * its own, so it ends up compared flat against the gate's darkening overlay rather than
 * contained within this map's subtree — a higher z-index on the overlay doesn't reliably
 * beat it. Simplest correct fix for a backdrop this obscured: don't render it here. */
export interface ScreenPoint {
  x: number;
  y: number;
}

export function GateBackgroundMap({ onPinPlaced }: { onPinPlaced: (point: ScreenPoint) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chennai: [number, number] = [CMDA_CENTER.lng, CMDA_CENTER.lat];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Always the satellite view, as a globe: Earth from space, then a fly-in to Chennai.
    // This doesn't touch the citizen's saved map view (see appearance.ts).
    const satellite = getMapStyle('satellite').style as object;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { ...satellite, projection: { type: 'globe' } } as maplibregl.StyleSpecification,
      center: reduceMotion ? chennai : SPACE_VIEW.center,
      zoom: reduceMotion ? CHENNAI_ZOOM : SPACE_VIEW.zoom,
      interactive: false,
      attributionControl: false,
    });

    // The pin itself is drawn by EntryGate, above its scrim, so it stays crisp; this
    // only reports where Chennai ended up on screen once the camera has settled.
    map.jumpTo({ padding: FOCAL_PADDING });

    function dropPin() {
      const point = map.project(chennai);
      onPinPlaced({ x: point.x, y: point.y });
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    map.once('load', () => {
      if (reduceMotion) {
        dropPin();
        return;
      }
      map.once('moveend', dropPin);
      timer = setTimeout(
        () => map.flyTo({ center: chennai, zoom: CHENNAI_ZOOM, padding: FOCAL_PADDING, duration: FLY_DURATION_MS, curve: 1.5, essential: true }),
        INTRO_DELAY_MS
      );
    });

    return () => {
      clearTimeout(timer);
      map.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once.
  }, []);

  // Two nested divs, not one: MapLibre forces `position: relative` on whatever
  // container it's given (see .maplibregl-map in its own stylesheet), which silently
  // overrides `position: absolute` and collapses inset-0's height to 0. The outer div
  // here is never touched by MapLibre, so it keeps the `absolute inset-0` that takes
  // it out of flow (otherwise it'd push the gate's title/button content down off
  // screen); the inner one — the one MapLibre repositions — just needs h-full/w-full
  // to fill that already-correctly-sized outer box.
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
