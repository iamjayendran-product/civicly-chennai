import type { Map as MapLibreMap, PointLike } from 'maplibre-gl';

// Street-level imagery from Mapillary (free, crowd-sourced; needs a client token but no
// billing). MapLibre has no Street View of its own. Coverage in Chennai is patchy, so the
// coverage lines show citizens where a street-level view exists before they tap.

const SOURCE_ID = 'mapillary';
export const STREET_VIEW_LAYER_ID = 'mapillary-sequences';
/** Half-width of the box searched around a tap for the nearest image (~50 m). */
const SEARCH_HALF_DEG = 0.0005;

export function buildNearestImageUrl(token: string, lng: number, lat: number): string {
  const params = new URLSearchParams({
    access_token: token,
    fields: 'id',
    limit: '1',
    bbox: [lng - SEARCH_HALF_DEG, lat - SEARCH_HALF_DEG, lng + SEARCH_HALF_DEG, lat + SEARCH_HALF_DEG].join(','),
  });
  return `https://graph.mapillary.com/images?${params.toString()}`;
}

export async function findNearestImageId(
  token: string,
  lng: number,
  lat: number,
  fetchImpl: (url: string) => Promise<Response> = fetch
): Promise<string | null> {
  try {
    const response = await fetchImpl(buildNearestImageUrl(token, lng, lat));
    if (!response.ok) return null;
    const body = (await response.json()) as { data?: { id?: unknown }[] };
    const id = body.data?.[0]?.id;
    return typeof id === 'string' && id !== '' ? id : null;
  } catch {
    return null;
  }
}

export function addStreetViewCoverage(map: MapLibreMap, token: string): void {
  if (map.getSource(SOURCE_ID)) return;
  map.addSource(SOURCE_ID, {
    type: 'vector',
    tiles: [`https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`],
    minzoom: 6,
    maxzoom: 14,
    attribution: '© Mapillary contributors',
  });
  map.addLayer({
    id: STREET_VIEW_LAYER_ID,
    type: 'line',
    source: SOURCE_ID,
    'source-layer': 'sequence',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#05cb63', 'line-width': 3, 'line-opacity': 0.8 },
  });
}

export function removeStreetViewCoverage(map: MapLibreMap): void {
  if (map.getLayer(STREET_VIEW_LAYER_ID)) map.removeLayer(STREET_VIEW_LAYER_ID);
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/** True when a map click landed on a street-view coverage line (so it opens imagery
 * rather than, say, moving the report pin). */
export function isStreetViewHit(map: MapLibreMap, point: PointLike): boolean {
  if (!map.getLayer(STREET_VIEW_LAYER_ID)) return false;
  return map.queryRenderedFeatures(point, { layers: [STREET_VIEW_LAYER_ID] }).length > 0;
}
