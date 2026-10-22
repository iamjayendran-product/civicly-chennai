import { describe, it, expect, vi } from 'vitest';
import streetsVadapalani from './__fixtures__/streets-vadapalani.json';
import streetsNone from './__fixtures__/streets-none.json';
import roadSuggestions from './__fixtures__/road-suggestions-arunachalam.json';
import {
  buildRoadSearchUrl,
  buildStreetsNearUrl,
  fetchStreetsNear,
  parseStreets,
  searchRoads,
} from './streetLookup';

// Recorded from GCC's GIS street layer (GCCDepts/EDPMobile2025) on 2026-10-15 — the same
// layer GCC's own complaint form uses to pick a street.
const VADAPALANI = { lng: 80.204032, lat: 13.05202 };

describe('buildStreetsNearUrl', () => {
  it('queries the GCC street layer within 25 m of the point, as GeoJSON in WGS84', () => {
    const url = new URL(buildStreetsNearUrl(VADAPALANI.lng, VADAPALANI.lat));
    expect(url.origin + url.pathname).toBe(
      'https://gisgcc.chennaicorporation.gov.in/server/rest/services/GCCDepts/EDPMobile2025/FeatureServer/0/query'
    );
    const p = url.searchParams;
    expect(JSON.parse(p.get('geometry')!)).toEqual({ x: VADAPALANI.lng, y: VADAPALANI.lat });
    expect(p.get('geometryType')).toBe('esriGeometryPoint');
    expect(p.get('inSR')).toBe('4326');
    expect(p.get('outSR')).toBe('4326');
    expect(p.get('distance')).toBe('25');
    expect(p.get('units')).toBe('esriSRUnit_Meter');
    expect(p.get('returnGeometry')).toBe('true');
    expect(p.get('f')).toBe('geojson');
  });
});

describe('buildRoadSearchUrl', () => {
  it('searches road names case-insensitively with a result cap', () => {
    const p = new URL(buildRoadSearchUrl('arunachalam')).searchParams;
    expect(p.get('where')).toBe("UPPER(road_name) LIKE '%ARUNACHALAM%'");
    expect(p.get('resultRecordCount')).toBe('8');
    expect(p.get('f')).toBe('geojson');
  });

  it('strips characters that could break out of the where clause', () => {
    const p = new URL(buildRoadSearchUrl("x' OR 1=1 --%_;")).searchParams;
    expect(p.get('where')).toBe("UPPER(road_name) LIKE '%X OR 11 %'");
  });
});

describe('parseStreets', () => {
  it('maps GCC street features to typed streets, nearest to the point first', () => {
    const streets = parseStreets(streetsVadapalani, VADAPALANI);
    expect(streets.map((s) => s.roadName)).toEqual(['Arunachalam Street', 'S.S.R.Pangajam Street']);
    expect(streets[0]).toMatchObject({
      roadId: '7553',
      roadName: 'Arunachalam Street',
      zone: '10',
      ward: '129',
      region: 'Central',
    });
    expect(streets[0].distanceM).toBeLessThan(streets[1].distanceM!);
    expect(streets[0].distanceM).toBeLessThanOrEqual(30);
  });

  it('gives each street an anchor point on its geometry to fly the map to', () => {
    const [first] = parseStreets(roadSuggestions);
    expect(first.anchor.lng).toBeGreaterThan(80);
    expect(first.anchor.lat).toBeGreaterThan(12.8);
  });

  it('handles MultiLineString geometry', () => {
    const streets = parseStreets(roadSuggestions);
    expect(streets.find((s) => s.roadName === 'Thatchi Arunachalam Street')).toBeDefined();
  });

  it('returns an empty list for no features or a malformed response', () => {
    expect(parseStreets(streetsNone)).toEqual([]);
    expect(parseStreets({ error: { code: 400 } })).toEqual([]);
    expect(parseStreets('<html>Service not found</html>')).toEqual([]);
  });

  it('skips features without a road id', () => {
    const raw = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: null, properties: { road_name: 'X' } }] };
    expect(parseStreets(raw)).toEqual([]);
  });
});

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe('fetchStreetsNear', () => {
  it('returns ok with streets when GCC finds streets near the pin', async () => {
    const fetchImpl = vi.fn(() => jsonResponse(streetsVadapalani));
    const result = await fetchStreetsNear(VADAPALANI.lng, VADAPALANI.lat, { fetchImpl });
    expect(result.status).toBe('ok');
    expect(result.status === 'ok' && result.streets[0].roadId).toBe('7553');
  });

  it('returns none when GCC has no street within 25 m', async () => {
    const fetchImpl = vi.fn(() => jsonResponse(streetsNone));
    expect(await fetchStreetsNear(80.118, 12.9249, { fetchImpl })).toEqual({ status: 'none' });
  });

  it('returns error on a network failure', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await fetchStreetsNear(VADAPALANI.lng, VADAPALANI.lat, { fetchImpl })).toEqual({ status: 'error' });
  });

  it('returns error when GCC does not answer within the timeout', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );
    expect(await fetchStreetsNear(VADAPALANI.lng, VADAPALANI.lat, { fetchImpl, timeoutMs: 10 })).toEqual({
      status: 'error',
    });
  });
});

describe('searchRoads', () => {
  it('returns matching GCC streets', async () => {
    const fetchImpl = vi.fn(() => jsonResponse(roadSuggestions));
    const streets = await searchRoads('arunachalam', { fetchImpl });
    expect(streets.length).toBe(8);
    expect(streets[0].roadName).toBe('V.P. Arunachalam Street');
  });

  it('does not call GCC for queries shorter than 3 characters', async () => {
    const fetchImpl = vi.fn(() => jsonResponse(roadSuggestions));
    expect(await searchRoads('ar', { fetchImpl })).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns an empty list when the search fails', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await searchRoads('arunachalam', { fetchImpl })).toEqual([]);
  });
});
