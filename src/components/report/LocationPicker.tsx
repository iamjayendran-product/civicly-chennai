'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER, CMDA_MAX_BOUNDS } from '@/lib/geo/cmda';
import type { PlaceResult } from '@/lib/geo/placeSearch';
import { LocationSearch } from '@/components/map/LocationSearch';
import { t } from '@/lib/i18n';

const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

// See src/components/map/MapView.tsx for why this is needed: maplibre-gl can't resolve
// its default worker script URL under Next's dev bundler, so the worker (and therefore
// all tile loading) silently never starts without this.
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

export interface LocationPickerProps {
  onChange: (location: { lng: number; lat: number }) => void;
}

export function LocationPicker({ onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map: MapLibreMap = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [CMDA_CENTER.lng, CMDA_CENTER.lat],
      zoom: 12,
      maxBounds: CMDA_MAX_BOUNDS,
    });
    mapRef.current = map;

    function setLocation(lng: number, lat: number) {
      markerRef.current?.setLngLat([lng, lat]);
      onChange({ lng, lat });
    }

    map.on('load', () => {
      const marker = new maplibregl.Marker({ draggable: true }).setLngLat([CMDA_CENTER.lng, CMDA_CENTER.lat]).addTo(map);
      markerRef.current = marker;
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        setLocation(lng, lat);
      });
      map.on('click', (event) => setLocation(event.lngLat.lng, event.lngLat.lat));

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { longitude, latitude } = position.coords;
            map.setCenter([longitude, latitude]);
            setLocation(longitude, latitude);
          },
          () => setGpsDenied(true)
        );
      } else {
        setGpsDenied(true);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [onChange]);

  function handleSearchSelect(place: PlaceResult) {
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 16 });
    markerRef.current?.setLngLat([place.lng, place.lat]);
    onChange({ lng: place.lng, lat: place.lat });
  }

  return (
    <div>
      <div className="mb-2">
        <LocationSearch onSelect={handleSearchSelect} />
      </div>
      <div ref={containerRef} className="h-64 w-full rounded-lg" />
      <p className="mt-1 text-xs text-gray-500">{gpsDenied ? t('report.location.gpsDenied') : t('report.location.dragHint')}</p>
    </div>
  );
}
