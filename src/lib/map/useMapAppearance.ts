'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { BEARING_3D, PITCH_3D, loadAppearance, saveAppearance, type MapAppearance } from './appearance';
import { DEFAULT_MAP_STYLE_ID, getMapStyle, type MapStyleId } from './styles';

/** Owns the basemap-view + 3D state for one map and applies changes to it. Pair it
 * with `loadAppearance()` when constructing the map so it opens in the saved view. */
export function useMapAppearance(mapRef: RefObject<MapLibreMap | null>) {
  const [appearance, setAppearance] = useState<MapAppearance>({ styleId: DEFAULT_MAP_STYLE_ID, is3d: false });

  useEffect(() => {
    // Deferred a tick (same pattern as elsewhere in the app) to satisfy the rule
    // against synchronous setState in an effect body.
    const id = setTimeout(() => setAppearance(loadAppearance()), 0);
    return () => clearTimeout(id);
  }, []);

  const changeStyle = useCallback(
    (styleId: MapStyleId) => {
      setAppearance((a) => ({ ...a, styleId }));
      saveAppearance({ styleId });
      // diff: false forces a full rebuild so 'style.load' always fires and callers can
      // re-add their own layers/images (a diffed update could silently drop them).
      mapRef.current?.setStyle(getMapStyle(styleId).style, { diff: false });
    },
    [mapRef]
  );

  const toggle3d = useCallback(
    (is3d: boolean) => {
      setAppearance((a) => ({ ...a, is3d }));
      saveAppearance({ is3d });
      mapRef.current?.easeTo({ pitch: is3d ? PITCH_3D : 0, bearing: is3d ? BEARING_3D : 0, duration: 900 });
    },
    [mapRef]
  );

  return { appearance, changeStyle, toggle3d };
}
