'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER } from '@/lib/geo/cmda';
import { configureMaplibreWorker } from '@/lib/map/setupWorker';

const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

configureMaplibreWorker();

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
export function GateBackgroundMap() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [CMDA_CENTER.lng, CMDA_CENTER.lat],
      zoom: 11,
      interactive: false,
      attributionControl: false,
    });
    return () => map.remove();
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
