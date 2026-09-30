import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CMDA_MAX_BOUNDS } from '@/lib/geo/cmda';

vi.mock('maplibre-gl', () => {
  const Map = vi.fn().mockImplementation(function (options: unknown) {
    return {
      options,
      addControl: vi.fn(),
      on: vi.fn(),
      remove: vi.fn(),
      getBounds: vi.fn(() => ({ getWest: () => 0, getSouth: () => 0, getEast: () => 0, getNorth: () => 0 })),
      getSource: vi.fn(() => undefined),
      hasImage: vi.fn(() => false),
      addImage: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
    };
  });
  const NavigationControl = vi.fn().mockImplementation(function () {
    return { __type: 'navigation' };
  });
  const GeolocateControl = vi.fn().mockImplementation(function () {
    return { __type: 'geolocate' };
  });
  return { Map, NavigationControl, GeolocateControl, setWorkerUrl: vi.fn() };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/lib/realtime/useReports', () => ({
  useReports: () => ({ reports: [], status: 'live' }),
}));

import * as maplibregl from 'maplibre-gl';
import { MapView } from './MapView';

describe('MapView initial viewport', () => {
  it('constructs the map fit to the CMDA extent instead of a fixed zoom/center', () => {
    render(<MapView />);

    const MapCtor = maplibregl.Map as unknown as ReturnType<typeof vi.fn>;
    expect(MapCtor).toHaveBeenCalledTimes(1);
    const options = MapCtor.mock.calls[0][0] as Record<string, unknown>;
    expect(options.bounds).toEqual(CMDA_MAX_BOUNDS);
    expect(options).not.toHaveProperty('center');
    expect(options).not.toHaveProperty('zoom');
  });

  it('adds a geolocate control alongside the navigation control, bottom-left', () => {
    render(<MapView />);

    const MapCtor = maplibregl.Map as unknown as ReturnType<typeof vi.fn>;
    const mapInstance = MapCtor.mock.results[0].value as { addControl: ReturnType<typeof vi.fn> };
    const GeolocateControlCtor = maplibregl.GeolocateControl as unknown as ReturnType<typeof vi.fn>;

    expect(GeolocateControlCtor).toHaveBeenCalledTimes(1);
    expect(mapInstance.addControl).toHaveBeenCalledWith(GeolocateControlCtor.mock.results[0].value, 'bottom-left');
  });
});
