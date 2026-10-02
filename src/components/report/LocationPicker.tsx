'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER, CMDA_MAX_BOUNDS } from '@/lib/geo/cmda';
import type { PlaceResult } from '@/lib/geo/placeSearch';
import { LocationSearch } from '@/components/map/LocationSearch';
import { MapStyleSwitcher } from '@/components/map/MapStyleSwitcher';
import { getMapStyle } from '@/lib/map/styles';
import { BEARING_3D, PITCH_3D, loadAppearance } from '@/lib/map/appearance';
import { useMapAppearance } from '@/lib/map/useMapAppearance';
import { addStandardControls } from '@/lib/map/standardControls';
import { t } from '@/lib/i18n';

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
  const { appearance, changeStyle, toggle3d } = useMapAppearance(mapRef);

  useEffect(() => {
    if (!containerRef.current) return;
    const saved = loadAppearance();
    const map: MapLibreMap = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(saved.styleId).style,
      pitch: saved.is3d ? PITCH_3D : 0,
      bearing: saved.is3d ? BEARING_3D : 0,
      center: [CMDA_CENTER.lng, CMDA_CENTER.lat],
      zoom: 12,
      maxBounds: CMDA_MAX_BOUNDS,
    });
    mapRef.current = map;
    // Same controls as every other map in the app (see standardControls.ts); a fix from
    // the locate button also moves the report pin.
    const geolocate = addStandardControls(map);
    geolocate.on('geolocate', (position) => setLocation(position.coords.longitude, position.coords.latitude));

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
    <div className="relative flex h-full flex-col">
      <div className="absolute z-10 m-3 w-[calc(100%-1.5rem)] max-w-72">
        <LocationSearch onSelect={handleSearchSelect} />
      </div>
      <div ref={containerRef} className="h-full w-full flex-1" />
      <p className="absolute left-3 top-16 z-10 rounded-lg bg-surface/90 px-2 py-1 text-xs text-muted">
        {gpsDenied ? t('report.location.gpsDenied') : t('report.location.dragHint')}
      </p>
      <div className="absolute bottom-8 right-2 z-10">
        <MapStyleSwitcher value={appearance.styleId} onChange={changeStyle} is3d={appearance.is3d} onToggle3d={toggle3d} />
      </div>
    </div>
  );
}
