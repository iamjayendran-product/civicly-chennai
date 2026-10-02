// Matches the OSM relation 12353813 bounding box used to seed public.cmda_boundary
// (see docs/superpowers/plans/2026-09-21-citizen-map-and-reporting.md, Task 2).
export const CMDA_BBOX = {
  minLng: 79.9994028,
  minLat: 12.8503752,
  maxLng: 80.3463295,
  maxLat: 13.2900221,
} as const;

export const CMDA_CENTER = {
  lng: (CMDA_BBOX.minLng + CMDA_BBOX.maxLng) / 2,
  lat: (CMDA_BBOX.minLat + CMDA_BBOX.maxLat) / 2,
} as const;

export const CMDA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [CMDA_BBOX.minLng, CMDA_BBOX.minLat],
  [CMDA_BBOX.maxLng, CMDA_BBOX.maxLat],
];

/** The CMDA extent grown by `fraction` of its size on every side. A tilted (3D) view
 * squeezes the far side of the map, so framing every pin on a phone needs the camera to
 * pull back further than a tight clamp to the CMDA box allows. Pins and reports are still
 * only ever inside the CMDA (enforced server-side); this only loosens how far the
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
