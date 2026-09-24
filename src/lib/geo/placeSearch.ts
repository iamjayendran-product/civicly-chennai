import { CMDA_BBOX } from './cmda';

// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// discourages heavy direct client-side use and asks for an identifying User-Agent or
// Referer — browsers can't set a custom User-Agent from fetch(), but do send Referer
// automatically, which satisfies the policy for this app's current (low) traffic. A
// production version serving real volume should proxy this through our own server
// instead of calling Nominatim directly from the browser.
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

export function buildNominatimSearchUrl(query: string): string {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    // left,top,right,bottom — i.e. minLng,maxLat,maxLng,minLat.
    viewbox: `${CMDA_BBOX.minLng},${CMDA_BBOX.maxLat},${CMDA_BBOX.maxLng},${CMDA_BBOX.minLat}`,
    bounded: '1',
    countrycodes: 'in',
    limit: '5',
  });
  return `${NOMINATIM_SEARCH_URL}?${params.toString()}`;
}

export interface PlaceResult {
  lng: number;
  lat: number;
  label: string;
}

interface RawNominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

function isRawNominatimResult(value: unknown): value is RawNominatimResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.lat === 'string' && typeof record.lon === 'string' && typeof record.display_name === 'string';
}

export function parseNominatimResults(raw: unknown): PlaceResult[] {
  if (!Array.isArray(raw)) return [];
  const results: PlaceResult[] = [];
  for (const entry of raw) {
    if (!isRawNominatimResult(entry)) continue;
    const lng = Number.parseFloat(entry.lon);
    const lat = Number.parseFloat(entry.lat);
    if (Number.isNaN(lng) || Number.isNaN(lat)) continue;
    results.push({ lng, lat, label: entry.display_name });
  }
  return results;
}
