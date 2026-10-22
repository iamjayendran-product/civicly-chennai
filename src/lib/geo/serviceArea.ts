import gccBoundary from './gcc-boundary.json';

/** Civicly's service area: the Greater Chennai Corporation (GCC) limits, because every
 * report is filed with GCC. Same polygon as public.gcc_boundary (OSM relation 1766358,
 * (c) OpenStreetMap contributors, ODbL; see the 20261015100000_gcc_service_area migration).
 * The server is authoritative (OUTSIDE_GCC); this copy drives the map and a client pre-check. */
export const GCC_BOUNDARY = gccBoundary as { type: 'Polygon'; coordinates: [number, number][][] };

const outerRing = GCC_BOUNDARY.coordinates[0];

export const GCC_BBOX = {
  minLng: Math.min(...outerRing.map(([lng]) => lng)),
  minLat: Math.min(...outerRing.map(([, lat]) => lat)),
  maxLng: Math.max(...outerRing.map(([lng]) => lng)),
  maxLat: Math.max(...outerRing.map(([, lat]) => lat)),
} as const;

export const GCC_CENTER = {
  lng: (GCC_BBOX.minLng + GCC_BBOX.maxLng) / 2,
  lat: (GCC_BBOX.minLat + GCC_BBOX.maxLat) / 2,
} as const;

export const GCC_MAX_BOUNDS: [[number, number], [number, number]] = [
  [GCC_BBOX.minLng, GCC_BBOX.minLat],
  [GCC_BBOX.maxLng, GCC_BBOX.maxLat],
];

/** The GCC extent grown by `fraction` of its size on every side. A tilted (3D) view
 * squeezes the far side of the map, so framing every pin on a phone needs the camera to
 * pull back further than a tight clamp to the GCC box allows. Pins and reports are still
 * only ever inside GCC limits (enforced server-side); this only loosens how far the
 * camera may wander. */
export function padBounds(
  bounds: [[number, number], [number, number]],
  fraction: number
): [[number, number], [number, number]] {
  const [[west, south], [east, north]] = bounds;
  const dx = (east - west) * fraction;
  const dy = (north - south) * fraction;
  return [
    [west - dx, south - dy],
    [east + dx, north + dy],
  ];
}

export interface BoundsLike {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
}

export interface BboxParams {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export function boundsToBboxParams(bounds: BoundsLike): BboxParams {
  return {
    minLng: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLng: bounds.getEast(),
    maxLat: bounds.getNorth(),
  };
}

/** Ray-casting point-in-polygon test against the GCC boundary (outer ring and any holes). */
export function isInServiceArea(lng: number, lat: number): boolean {
  const [outer, ...holes] = GCC_BOUNDARY.coordinates;
  return ringContains(outer, lng, lat) && !holes.some((hole) => ringContains(hole, lng, lat));
}

function ringContains(ring: [number, number][], lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
