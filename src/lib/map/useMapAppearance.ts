'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { loadAppearance, saveAppearance, type MapAppearance } from './appearance';
import { DEFAULT_MAP_STYLE_ID, getMapStyle, type MapStyleId } from './styles';

/** Owns the basemap view for one map and applies changes to it. Pair it with
 * `loadAppearance()` when constructing the map so it opens in the saved view. */
export function useMapAppearance(mapRef: RefObject<MapLibreMap | null>) {
  const [appearance, setAppearance] = useState<MapAppearance>({ styleId: DEFAULT_MAP_STYLE_ID });

  useEffect(() => {
    // Deferred a tick (same pattern as elsewhere in the app) to satisfy the rule
    // against synchronous setState in an effect body.
    const id = setTimeout(() => setAppearance(loadAppearance()), 0);
    return () => clearTimeout(id);
  }, []);

  const changeStyle = useCallback(
    (styleId: MapStyleId) => {
      setAppearance({ styleId });
      saveAppearance({ styleId });
      // diff: false forces a full rebuild so 'style.load' always fires and callers can
      // re-add their own layers/images (a diffed update could silently drop them).
      mapRef.current?.setStyle(getMapStyle(styleId).style, { diff: false });
    },
    [mapRef]
  );

  return { appearance, changeStyle };
}
