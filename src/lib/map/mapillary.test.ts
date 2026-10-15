import { describe, it, expect, vi } from 'vitest';
import {
  STREET_VIEW_LAYER_ID,
  addStreetViewCoverage,
  buildNearestImageUrl,
  findNearestImageId,
  isStreetViewHit,
  removeStreetViewCoverage,
} from './mapillary';

describe('buildNearestImageUrl', () => {
  it('asks Mapillary for one image in a small box around the point', () => {
    const url = new URL(buildNearestImageUrl('MLY|token', 80.204, 13.052));
    expect(url.origin + url.pathname).toBe('https://graph.mapillary.com/images');
    expect(url.searchParams.get('access_token')).toBe('MLY|token');
    expect(url.searchParams.get('fields')).toBe('id');
    expect(url.searchParams.get('limit')).toBe('1');
    const [w, s, e, n] = url.searchParams.get('bbox')!.split(',').map(Number);
    expect(w).toBeLessThan(80.204);
    expect(e).toBeGreaterThan(80.204);
    expect(s).toBeLessThan(13.052);
    expect(n).toBeGreaterThan(13.052);
    expect(e - w).toBeLessThan(0.002);
  });
});

describe('findNearestImageId', () => {
  it('returns the first image id', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [{ id: '123' }] }))));
    expect(await findNearestImageId('t', 80.2, 13.05, fetchImpl)).toBe('123');
  });

  it('returns null when there is no imagery there or the request fails', async () => {
    const empty = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: [] }))));
    expect(await findNearestImageId('t', 80.2, 13.05, empty)).toBeNull();
    const failing = vi.fn(() => Promise.reject(new TypeError('offline')));
    expect(await findNearestImageId('t', 80.2, 13.05, failing)).toBeNull();
  });
});

function fakeMap(hasSource = false) {
  return {
    getSource: vi.fn(() => (hasSource ? {} : undefined)),
    getLayer: vi.fn(() => (hasSource ? {} : undefined)),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    queryRenderedFeatures: vi.fn(() => [{}]),
  };
}

describe('street view coverage layer', () => {
  it('adds Mapillary coverage lines as a vector tile layer', () => {
    const map = fakeMap();
    addStreetViewCoverage(map as never, 'MLY|token');
    const [, source] = map.addSource.mock.calls[0] as unknown as [string, { type: string; tiles: string[] }];
    expect(source.type).toBe('vector');
    expect(source.tiles[0]).toContain('tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}');
    expect(source.tiles[0]).toContain('access_token=MLY%7Ctoken');
    expect((map.addLayer.mock.calls[0] as unknown as [{ id: string }])[0].id).toBe(STREET_VIEW_LAYER_ID);
  });

  it('removes the coverage layer', () => {
    const map = fakeMap(true);
    removeStreetViewCoverage(map as never);
    expect(map.removeLayer).toHaveBeenCalledWith(STREET_VIEW_LAYER_ID);
    expect(map.removeSource).toHaveBeenCalled();
  });

  it('only counts a click as a street-view hit while coverage is shown', () => {
    expect(isStreetViewHit(fakeMap(false) as never, [1, 1])).toBe(false);
    expect(isStreetViewHit(fakeMap(true) as never, [1, 1])).toBe(true);
  });
});
