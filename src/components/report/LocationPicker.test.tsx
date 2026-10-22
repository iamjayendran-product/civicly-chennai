import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';

type Handler = (...args: unknown[]) => void;

vi.mock('maplibre-gl', () => {
  const Map = vi.fn().mockImplementation(function (options: unknown) {
    const handlers: Record<string, Handler[]> = {};
    return {
      options,
      handlers,
      addControl: vi.fn(),
      on: vi.fn((event: string, handler: Handler) => {
        (handlers[event] ??= []).push(handler);
      }),
      remove: vi.fn(),
      setStyle: vi.fn(),
      flyTo: vi.fn(),
      setCenter: vi.fn(),
      getSource: vi.fn(() => undefined),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(() => undefined),
      queryRenderedFeatures: vi.fn(() => []),
    };
  });
  const Marker = vi.fn().mockImplementation(function () {
    const marker = {
      setLngLat: vi.fn(() => marker),
      addTo: vi.fn(() => marker),
      on: vi.fn(),
      getLngLat: vi.fn(() => ({ lng: 0, lat: 0 })),
      setPopup: vi.fn(() => marker),
      togglePopup: vi.fn(),
      getPopup: vi.fn(() => null),
    };
    return marker;
  });
  const Popup = vi.fn().mockImplementation(function () {
    const popup = { setText: vi.fn(() => popup), setDOMContent: vi.fn(() => popup), isOpen: vi.fn(() => false) };
    return popup;
  });
  const ctl = (type: string) =>
    vi.fn().mockImplementation(function () {
      return { __type: type, on: vi.fn() };
    });
  return {
    Map,
    Marker,
    Popup,
    NavigationControl: ctl('navigation'),
    GeolocateControl: ctl('geolocate'),
    FullscreenControl: ctl('fullscreen'),
    setWorkerUrl: vi.fn(),
  };
});

import * as maplibregl from 'maplibre-gl';
import { LocationPicker, pinPopupText } from './LocationPicker';

function lastMap() {
  const MapCtor = maplibregl.Map as unknown as ReturnType<typeof vi.fn>;
  return MapCtor.mock.results.at(-1)!.value as {
    options: Record<string, unknown>;
    handlers: Record<string, Handler[]>;
    addControl: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
});

describe('pinPopupText', () => {
  it('formats the pin position like GCC’s form, to 6 decimals', () => {
    expect(pinPopupText(80.204032, 13.05202)).toBe('Latitude : 13.052020\nLongitude : 80.204032');
  });
});

describe('LocationPicker', () => {
  it('opens flat (no 3D tilt), clamped to GCC limits', () => {
    render(<LocationPicker value={null} onChange={vi.fn()} />);
    expect(lastMap().options.pitch).toBe(0);
    expect(lastMap().options.maxBounds).toBeDefined();
  });

  it('adds a fullscreen control top-right, like GCC’s map', () => {
    render(<LocationPicker value={null} onChange={vi.fn()} />);
    const FullscreenCtor = maplibregl.FullscreenControl as unknown as ReturnType<typeof vi.fn>;
    expect(lastMap().addControl).toHaveBeenCalledWith(FullscreenCtor.mock.results.at(-1)!.value, 'top-right');
  });

  it('shows the Map | Satellite switch instead of the old view menu', () => {
    render(<LocationPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('map.style.map') })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('map.style.satellite') })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('map.style.title') })).not.toBeInTheDocument();
  });

  it('drops the pin where the map is clicked and reports the location', () => {
    const onChange = vi.fn();
    render(<LocationPicker value={null} onChange={onChange} />);
    const map = lastMap();
    map.handlers['load'].forEach((h) => h());
    map.handlers['click'].forEach((h) => h({ lngLat: { lng: 80.204032, lat: 13.05202 } }));
    expect(onChange).toHaveBeenCalledWith({ lng: 80.204032, lat: 13.05202 });
  });

  it('does not move the pin when a street-view coverage line is tapped', () => {
    const onChange = vi.fn();
    render(<LocationPicker value={null} onChange={onChange} />);
    const map = lastMap() as ReturnType<typeof lastMap> & {
      getLayer: ReturnType<typeof vi.fn>;
      queryRenderedFeatures: ReturnType<typeof vi.fn>;
    };
    map.handlers['load'].forEach((h) => h());
    map.getLayer.mockReturnValue({});
    map.queryRenderedFeatures.mockReturnValue([{}]);
    map.handlers['click'].forEach((h) => h({ point: { x: 1, y: 1 }, lngLat: { lng: 80.2, lat: 13.05 } }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
