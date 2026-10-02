'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_MAX_BOUNDS, boundsToBboxParams } from '@/lib/geo/cmda';
import { useReports, type ReportPin } from '@/lib/realtime/useReports';
import { Filters } from './Filters';
import { PinSheet } from './PinSheet';
import { LocationSearch } from './LocationSearch';
import { Legend } from './Legend';
import { MapStyleSwitcher } from './MapStyleSwitcher';
import { getMapStyle } from '@/lib/map/styles';
import { BEARING_3D, PITCH_3D, loadAppearance } from '@/lib/map/appearance';
import { useMapAppearance } from '@/lib/map/useMapAppearance';
import { addStandardControls } from '@/lib/map/standardControls';
import { registerReportIcons, reportIconId } from '@/lib/map/reportIcons';
import { configureMaplibreWorker } from '@/lib/map/setupWorker';
import { t } from '@/lib/i18n';
import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];

configureMaplibreWorker();

const SOURCE_ID = 'reports';
const REPORTS_LAYER_ID = 'reports-pins';

function reportsToGeoJson(reports: ReportPin[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: reports.map((report) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [report.lng, report.lat] },
      properties: {
        id: report.id,
        status: report.status,
        iconId: reportIconId(report.category, report.status),
        upvoteCount: report.upvoteCount,
      },
    })),
  };
}

export function MapView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusReportId = searchParams.get('focus');
  const hasFocusedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const reportsRef = useRef<ReportPin[]>([]);
  const [bbox, setBbox] = useState<ReturnType<typeof boundsToBboxParams> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportPin | null>(null);

  const { reports, status } = useReports(bbox, showFixed);
  const visibleReports = selectedCategory ? reports.filter((r) => r.category === selectedCategory) : reports;

  // Arriving via the post-submit "see your grievance" link: once that report shows up
  // in the loaded set, fly to it and open its sheet. Runs once per page load (a ref
  // guard, not state, so it doesn't re-fire if the user later clears the selection).
  useEffect(() => {
    if (!focusReportId || hasFocusedRef.current) return;
    const report = reports.find((r) => r.id === focusReportId);
    if (!report || !mapRef.current) return;
    hasFocusedRef.current = true;
    mapRef.current.flyTo({ center: [report.lng, report.lat], zoom: 16 });
    setSelectedReport(report);
    router.replace('/home', { scroll: false });
  }, [reports, focusReportId, router]);

  const { appearance, changeStyle, toggle3d } = useMapAppearance(mapRef);

  useEffect(() => {
    if (!containerRef.current) return;
    const saved = loadAppearance();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(saved.styleId).style,
      pitch: saved.is3d ? PITCH_3D : 0,
      bearing: saved.is3d ? BEARING_3D : 0,
      // Opens fitted to the whole CMDA extent rather than a fixed zoom level, so the
      // initial view always shows exactly the area `maxBounds` clamps panning to.
      bounds: CMDA_MAX_BOUNDS,
      maxBounds: CMDA_MAX_BOUNDS,
    });
    mapRef.current = map;
    // Same controls as every other map in the app (see standardControls.ts).
    addStandardControls(map);

    function updateBboxFromMap() {
      setBbox(boundsToBboxParams(map.getBounds()));
    }

    // 'style.load' (not 'load') fires for the first style and again after every
    // setStyle(), which wipes images, sources and layers — so the report layer is
    // re-added here each time the basemap changes.
    map.on('style.load', () => {
      registerReportIcons(map);
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: reportsToGeoJson(reportsRef.current),
      });
      map.addLayer({
        id: REPORTS_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        layout: {
          'icon-image': ['get', 'iconId'],
          'icon-size': 1,
          // The pin's tip (not its centre) marks the reported spot.
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          // "+X" badge, shown only once someone else has confirmed the same issue
          // (upvoteCount is 0 until confirm_same_issue is called at least once).
          'text-field': ['case', ['>', ['get', 'upvoteCount'], 0], ['concat', '+', ['to-string', ['get', 'upvoteCount']]], ''],
          // 'Noto Sans Regular' is the only regular-weight font OpenFreeMap's liberty
          // style actually serves — anything else 404s on every load.
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [1.1, -3.1],
          'text-anchor': 'center',
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 1.2,
        },
      });
    });

    map.on('load', () => {
      updateBboxFromMap();
      map.on('click', REPORTS_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        const report = id ? reportsRef.current.find((r) => r.id === id) : undefined;
        if (report) setSelectedReport(report);
      });
    });

    map.on('moveend', updateBboxFromMap);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    reportsRef.current = visibleReports;
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE_ID)) return;
    (map.getSource(SOURCE_ID) as GeoJSONSource).setData(reportsToGeoJson(visibleReports));
  }, [visibleReports]);

  return (
    // flex-1/min-h-0 (not h-dvh): this is a flex child of <body> alongside
    // SessionProvider's optional Turnstile/error banners, so it needs to fill
    // whatever space they leave rather than always claiming the full viewport.
    <div className="relative min-h-0 w-full flex-1">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-0 w-full bg-surface/80 backdrop-blur-sm">
        <div className="p-2">
          <Filters
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            showFixed={showFixed}
            onToggleShowFixed={setShowFixed}
          />
        </div>
        <div className="px-2 pb-2">
          <LocationSearch
            onSelect={(place) => mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 })}
            className="max-w-[180px]"
          />
        </div>
      </div>
      {/* The primary call-to-action on this page: a solid, bold pill with a slow glow
          pulse (see .civicly-cta in globals.css) so it's the first thing the eye lands
          on. bottom-16, not bottom-4: clears MapLibre's attribution control, which can
          render full-width and taller than its collapsed button before the user's
          first drag collapses it. The container is already sized to the visible dvh
          area (see the flex-1/min-h-0 note above), so mobile browser chrome is safe. */}
      <Link
        href="/report/new"
        className="civicly-cta absolute bottom-16 left-1/2 z-10 flex w-max items-center gap-2 whitespace-nowrap rounded-full border-2 border-white/70 bg-primary px-7 py-4 text-base font-extrabold tracking-wide text-white"
      >
        <span aria-hidden="true" className="text-2xl font-black leading-none">
          +
        </span>
        <span>{t('map.reportButton')}</span>
      </Link>
      {status === 'paused' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white">
          {t('map.status.paused')}
        </div>
      )}
      {/* bottom-16, not bottom-4: MapLibre's own attribution control also lives in this
          corner (bottom-right) and can grow taller than its collapsed button on first
          load, before the user's first drag collapses it — this clears that. */}
      <div className="absolute bottom-16 right-2 z-10 flex flex-col items-end gap-2">
        <MapStyleSwitcher
          value={appearance.styleId}
          onChange={changeStyle}
          is3d={appearance.is3d}
          onToggle3d={toggle3d}
        />
        <Legend />
      </div>
      <PinSheet report={selectedReport} onClose={() => setSelectedReport(null)} />
    </div>
  );
}
