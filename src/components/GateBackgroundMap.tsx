'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER } from '@/lib/geo/cmda';
import { configureMaplibreWorker } from '@/lib/map/setupWorker';
import { getMapStyle } from '@/lib/map/styles';

configureMaplibreWorker();

const SPACE_VIEW = { center: [78.5, 18] as [number, number], zoom: 0.7 };
const CHENNAI = { center: [CMDA_CENTER.lng, CMDA_CENTER.lat] as [number, number], zoom: 11 };
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
export interface GateBackgroundMapProps {
  /** Distance from the top of the screen, in px, where Chennai should end up — the tip
   * of the logo pin, so the map's pin lands exactly on it. */
  focalY: number;
  /** Called once the camera has settled on Chennai (or straight away with reduced motion). */
  onSettled: () => void;
}

export function GateBackgroundMap({ focalY, onSettled }: GateBackgroundMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chennai = CHENNAI.center;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Camera padding moves the visual centre: with the centre at `focalY`, Chennai
    // lands there instead of mid-screen.
    const height = containerRef.current.clientHeight || window.innerHeight;
    const padding =
      focalY * 2 <= height
        ? { top: 0, bottom: height - focalY * 2, left: 0, right: 0 }
        : { top: focalY * 2 - height, bottom: 0, left: 0, right: 0 };
    // Always the satellite view, as a globe: Earth from space, then a single fly-in.
    // This doesn't touch the citizen's saved map view (see appearance.ts).
    const satellite = getMapStyle('satellite').style as object;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { ...satellite, projection: { type: 'globe' } } as maplibregl.StyleSpecification,
      center: reduceMotion ? chennai : SPACE_VIEW.center,
      zoom: reduceMotion ? CHENNAI.zoom : SPACE_VIEW.zoom,
      interactive: false,
      attributionControl: false,
    });
    map.jumpTo({ padding });

    let timer: ReturnType<typeof setTimeout> | undefined;
    map.once('load', () => {
      if (reduceMotion) {
        onSettled();
        return;
      }
      map.once('moveend', onSettled);
      timer = setTimeout(
        () => map.flyTo({ center: chennai, zoom: CHENNAI.zoom, padding, duration: FLY_DURATION_MS, curve: 1.5, essential: true }),
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
