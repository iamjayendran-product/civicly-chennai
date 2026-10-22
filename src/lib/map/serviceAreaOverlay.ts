import type { Map as MapLibreMap } from 'maplibre-gl';
import { GCC_BOUNDARY } from '@/lib/geo/serviceArea';

const MASK_SOURCE_ID = 'service-area-mask';
const OUTLINE_SOURCE_ID = 'service-area-outline';
export const SERVICE_AREA_MASK_LAYER_ID = 'service-area-mask';
export const SERVICE_AREA_OUTLINE_LAYER_ID = 'service-area-outline';

/** A world-covering polygon with the GCC boundary as its hole: filling it dims
 * everything outside the area Civicly accepts reports for. */
export function buildOutsideMask() {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [-180, -85],
          [180, -85],
          [180, 85],
          [-180, 85],
          [-180, -85],
        ],
        GCC_BOUNDARY.coordinates[0],
      ] as [number, number][][],
    },
  };
}

/** Dims the map outside GCC limits and outlines the boundary. Call from 'style.load'
 * (every setStyle() wipes sources and layers); safe to call twice on the same style. */
export function addServiceAreaOverlay(map: MapLibreMap): void {
  if (map.getSource(MASK_SOURCE_ID)) return;
  map.addSource(MASK_SOURCE_ID, { type: 'geojson', data: buildOutsideMask() });
  map.addSource(OUTLINE_SOURCE_ID, {
    type: 'geojson',
    data: { type: 'Feature', properties: {}, geometry: GCC_BOUNDARY },
  });
  map.addLayer({
    id: SERVICE_AREA_MASK_LAYER_ID,
    type: 'fill',
    source: MASK_SOURCE_ID,
    paint: { 'fill-color': '#000000', 'fill-opacity': 0.35 },
  });
  map.addLayer({
    id: SERVICE_AREA_OUTLINE_LAYER_ID,
    type: 'line',
    source: OUTLINE_SOURCE_ID,
    paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-opacity': 0.9 },
  });
}
