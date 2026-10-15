'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Map as MapLibreMap, MapLayerMouseEvent } from 'maplibre-gl';
import { t } from '@/lib/i18n';
import {
  STREET_VIEW_LAYER_ID,
  addStreetViewCoverage,
  findNearestImageId,
  removeStreetViewCoverage,
} from '@/lib/map/mapillary';

export interface StreetViewProps {
  mapRef: RefObject<MapLibreMap | null>;
  /** Mapillary client token; the feature is hidden without one. */
  token?: string;
}

type Panel = { state: 'loading' } | { state: 'image'; imageId: string } | { state: 'none' };

/** The "pegman" of Civicly's maps: shows where street-level imagery exists and opens it
 * in a panel. Uses Mapillary, since MapLibre has no Street View. */
export function StreetView({ mapRef, token = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN }: StreetViewProps) {
  const [active, setActive] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);

  const handleCoverageClick = useCallback(
    async (event: MapLayerMouseEvent) => {
      if (!token) return;
      setPanel({ state: 'loading' });
      const imageId = await findNearestImageId(token, event.lngLat.lng, event.lngLat.lat);
      setPanel(imageId ? { state: 'image', imageId } : { state: 'none' });
    },
    [token]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !token || !active) return;
    const show = () => addStreetViewCoverage(map, token);
    show();
    // A basemap switch wipes layers: put coverage back while street view is on.
    map.on('style.load', show);
    map.on('click', STREET_VIEW_LAYER_ID, handleCoverageClick);
    return () => {
      map.off('style.load', show);
      map.off('click', STREET_VIEW_LAYER_ID, handleCoverageClick);
      removeStreetViewCoverage(map);
    };
  }, [active, mapRef, token, handleCoverageClick]);

  if (!token) return null;

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          aria-pressed={active}
          aria-label={t('map.streetView.toggle')}
          title={t('map.streetView.toggle')}
          onClick={() => setActive((on) => !on)}
          className={`flex h-10 w-10 items-center justify-center rounded-md bg-white text-xl shadow-md ${
            active ? 'ring-2 ring-[#05cb63]' : ''
          }`}
        >
          <span aria-hidden="true">🚶</span>
        </button>
        {active && <p className="max-w-48 rounded-lg bg-black/75 px-2 py-1 text-xs text-white">{t('map.streetView.hint')}</p>}
      </div>
      {panel && <StreetViewPanel token={token} panel={panel} onClose={() => setPanel(null)} />}
    </>
  );
}

function StreetViewPanel({ token, panel, onClose }: { token: string; panel: Panel; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageId = panel.state === 'image' ? panel.imageId : null;

  useEffect(() => {
    if (!imageId || !containerRef.current) return;
    const container = containerRef.current;
    let viewer: { remove: () => void } | null = null;
    let cancelled = false;
    // Loaded only when someone actually opens street view (it's a large library).
    Promise.all([import('mapillary-js'), import('mapillary-js/dist/mapillary.css')]).then(([{ Viewer }]) => {
      if (cancelled) return;
      viewer = new Viewer({ accessToken: token, container, imageId });
    });
    return () => {
      cancelled = true;
      viewer?.remove();
    };
  }, [token, imageId]);

  return (
    <div
      role="dialog"
      aria-label={t('map.streetView.title')}
      className="fixed inset-x-0 bottom-0 z-30 flex h-[55dvh] flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl lg:inset-x-auto lg:bottom-4 lg:right-4 lg:h-[60dvh] lg:w-[40rem] lg:rounded-2xl"
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-sm font-medium">{t('map.streetView.title')}</p>
        <button type="button" onClick={onClose} aria-label={t('map.streetView.close')} className="px-2 text-lg">
          ✕
        </button>
      </div>
      <div className="relative flex-1">
        {panel.state === 'loading' && <p className="p-4 text-sm text-muted">{t('map.streetView.loading')}</p>}
        {panel.state === 'none' && <p className="p-4 text-sm text-muted">{t('map.streetView.noImagery')}</p>}
        <div ref={containerRef} className="absolute inset-0" hidden={panel.state !== 'image'} />
      </div>
      <p className="border-t border-line px-3 py-1 text-[10px] text-muted">{t('map.streetView.attribution')}</p>
    </div>
  );
}
