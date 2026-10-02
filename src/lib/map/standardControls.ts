import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';

/** The control set every interactive map in the app shares: zoom +/- with a compass
 * (click to reset bearing/pitch, drag to rotate) and "find my location", stacked in
 * the bottom-left. Returns the geolocate control so callers can react to a fix. */
export function addStandardControls(map: MapLibreMap): maplibregl.GeolocateControl {
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-left');
  const geolocate = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } });
  map.addControl(geolocate, 'bottom-left');
  return geolocate;
}
