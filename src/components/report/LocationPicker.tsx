'use client';

import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GCC_CENTER, GCC_MAX_BOUNDS } from '@/lib/geo/serviceArea';
import type { PlaceResult } from '@/lib/geo/placeSearch';
import { LocationSearch } from '@/components/map/LocationSearch';
import { MapSatelliteToggle } from '@/components/map/MapSatelliteToggle';
import { getMapStyle } from '@/lib/map/styles';
import { loadAppearance } from '@/lib/map/appearance';
import { useMapAppearance } from '@/lib/map/useMapAppearance';
import { addStandardControls } from '@/lib/map/standardControls';
import { addServiceAreaOverlay } from '@/lib/map/serviceAreaOverlay';
import { isStreetViewHit } from '@/lib/map/mapillary';
import { StreetView } from '@/components/map/StreetView';
import { t } from '@/lib/i18n';

// See src/components/map/MapView.tsx for why this is needed: maplibre-gl can't resolve
// its default worker script URL under Next's dev bundler, so the worker (and therefore
// all tile loading) silently never starts without this.
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

/** The pin's popup text, in the same format as GCC's complaint form map. */
export function pinPopupText(lng: number, lat: number): string {
  return `Latitude : ${lat.toFixed(6)}\nLongitude : ${lng.toFixed(6)}`;
}

export interface LocationPickerProps {
  /** The current pin, if one has been placed. */
  value: { lng: number; lat: number } | null;
  onChange: (location: { lng: number; lat: number }) => void;
}

/** "Complaint Location Details" map, laid out like GCC's form: Map | Satellite top-left,
 * search top-centre, fullscreen top-right; click or drag to place the pin, whose popup
 * shows its latitude/longitude. Always flat (no 3D tilt) so the pin lands precisely. */
export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [gpsDenied, setGpsDenied] = useState(false);
  const { appearance, changeStyle } = useMapAppearance(mapRef);

  useEffect(() => {
    if (!containerRef.current) return;
    const saved = loadAppearance();
    const map: MapLibreMap = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(saved.styleId).style,
      pitch: 0,
      bearing: 0,
      center: [GCC_CENTER.lng, GCC_CENTER.lat],
      zoom: 12,
      maxBounds: GCC_MAX_BOUNDS,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');
    // Same controls as every other map in the app (see standardControls.ts); a fix from
    // the locate button also moves the report pin.
    const geolocate = addStandardControls(map);
    geolocate.on('geolocate', (position) => setLocation(position.coords.longitude, position.coords.latitude));

    function setLocation(lng: number, lat: number) {
      markerRef.current?.setLngLat([lng, lat]);
      onChange({ lng, lat });
    }

    // Re-added after every basemap switch (setStyle wipes layers).
    map.on('style.load', () => addServiceAreaOverlay(map));

    map.on('load', () => {
      const popup = new maplibregl.Popup({ offset: 36, closeOnClick: false });
      popupRef.current = popup;
      const marker = new maplibregl.Marker({ draggable: true, color: '#e53935' })
        .setLngLat([GCC_CENTER.lng, GCC_CENTER.lat])
        .setPopup(popup)
        .addTo(map);
      markerRef.current = marker;
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        setLocation(lng, lat);
      });
      map.on('click', (event) => {
        // A tap on a street-view line opens imagery (StreetView), not a new pin spot.
        if (isStreetViewHit(map, event.point)) return;
        setLocation(event.lngLat.lng, event.lngLat.lat);
      });

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
      popupRef.current = null;
    };
  }, [onChange]);

  // Keep the pin's lat/lng popup in step with the chosen spot, and open it.
  useEffect(() => {
    const marker = markerRef.current;
    const popup = popupRef.current;
    if (!value || !marker || !popup) return;
    popup.setText(pinPopupText(value.lng, value.lat));
    if (!popup.isOpen()) marker.togglePopup();
  }, [value]);

  function handleSearchSelect(place: PlaceResult) {
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 17 });
    markerRef.current?.setLngLat([place.lng, place.lat]);
    onChange({ lng: place.lng, lat: place.lat });
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="absolute left-3 top-3 z-10">
        <MapSatelliteToggle value={appearance.styleId} onChange={changeStyle} />
      </div>
      <div className="absolute left-1/2 top-3 z-10 w-[min(28rem,calc(100%-12rem))] -translate-x-1/2 max-sm:left-3 max-sm:top-14 max-sm:w-[calc(100%-4.5rem)] max-sm:translate-x-0">
        <LocationSearch onSelect={handleSearchSelect} />
      </div>
      <div ref={containerRef} className="h-full w-full flex-1 [&_.maplibregl-popup-content]:whitespace-pre-line [&_.maplibregl-popup-content]:text-sm [&_.maplibregl-popup-content]:text-neutral-900" />
      <div className="absolute bottom-10 right-3 z-10">
        <StreetView mapRef={mapRef} />
      </div>
      <p className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-surface/90 px-2 py-1 text-xs text-muted">
        {gpsDenied ? t('report.location.gpsDenied') : t('report.location.dragHint')}
      </p>
    </div>
  );
}
