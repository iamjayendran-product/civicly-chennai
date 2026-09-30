'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_MAX_BOUNDS, boundsToBboxParams } from '@/lib/geo/cmda';
import { useReports, type ReportPin } from '@/lib/realtime/useReports';
import { Filters } from './Filters';
import { PinSheet } from './PinSheet';
import { LocationSearch } from './LocationSearch';
import { Legend } from './Legend';
import { registerReportIcons, reportIconId } from '@/lib/map/reportIcons';
import { MAP_COLORS } from '@/lib/map/colors';
import { t } from '@/lib/i18n';
import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];

const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL;

// maplibre-gl resolves its default worker script URL from `import.meta.url` inside its own
// package, which Next's webpack dev bundler does not expose as a real http(s) URL — the library
// silently falls back to an empty string and the worker never starts (verified: Worker is
// constructed with url `""`, so zero tile requests ever fire). `public/maplibre-gl-worker.mjs`
// is a checked-in copy of `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`; re-copy it
// after any maplibre-gl version bump.
if (typeof window !== 'undefined') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

const SOURCE_ID = 'reports';
const CLUSTER_LAYER_ID = 'reports-clusters';
const CLUSTER_COUNT_LAYER_ID = 'reports-cluster-count';
const UNCLUSTERED_LAYER_ID = 'reports-unclustered';

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
    router.replace('/', { scroll: false });
  }, [reports, focusReportId, router]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      // Opens fitted to the whole CMDA extent rather than a fixed zoom level, so the
      // initial view always shows exactly the area `maxBounds` clamps panning to.
      bounds: CMDA_MAX_BOUNDS,
      maxBounds: CMDA_MAX_BOUNDS,
    });
    mapRef.current = map;
    // Zoom +/- and a compass (click to reset bearing/pitch, or drag to rotate), plus
    // "find my location". Bottom-left avoids the top search/filter bar and the "Report
    // a Grievance" button, both of which already occupy the top and bottom-right/center.
    map.addControl(new maplibregl.NavigationControl(), 'bottom-left');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'bottom-left');

    function updateBboxFromMap() {
      setBbox(boundsToBboxParams(map.getBounds()));
    }

    map.on('load', () => {
      updateBboxFromMap();
      registerReportIcons(map);
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: reportsToGeoJson(reportsRef.current),
        cluster: true,
        clusterRadius: 40,
      });
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': MAP_COLORS.pothole,
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 26],
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        // 'text-font' is explicit because MapLibre otherwise asks for its default
        // stack, which OpenFreeMap's liberty style does not serve — a glyph 404 on
        // every page load. 'Noto Sans Regular' is the only regular-weight font in
        // liberty's own glyph set.
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
      map.addLayer({
        id: UNCLUSTERED_LAYER_ID,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['get', 'iconId'],
          'icon-size': 0.5,
          'icon-allow-overlap': true,
          // "+X" badge, shown only once someone else has confirmed the same issue
          // (upvoteCount is 0 until confirm_same_issue is called at least once).
          'text-field': ['case', ['>', ['get', 'upvoteCount'], 0], ['concat', '+', ['to-string', ['get', 'upvoteCount']]], ''],
          // 'Noto Sans Regular' is the only regular-weight font OpenFreeMap's liberty
          // style actually serves — see the cluster-count layer above; anything else
          // 404s on every load.
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-offset': [1.1, -1.1],
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

      map.on('click', UNCLUSTERED_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        const report = id ? reportsRef.current.find((r) => r.id === id) : undefined;
        if (report) setSelectedReport(report);
      });

      map.on('click', CLUSTER_LAYER_ID, (event) => {
        const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
        const clusterId = feature?.properties?.cluster_id as number | undefined;
        const geometry = feature?.geometry;
        if (clusterId === undefined || geometry?.type !== 'Point') return;
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom) => {
          const [lng, lat] = geometry.coordinates;
          map.easeTo({ center: [lng, lat], zoom });
        });
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
        <div className="flex items-center justify-between gap-2 p-2">
          <div className="min-w-0 flex-1">
            <Filters
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              showFixed={showFixed}
              onToggleShowFixed={setShowFixed}
            />
          </div>
          {/* The primary call-to-action on this page — kept in the header row (not
              bottom-fixed) so browser chrome (address bar, bookmarks/download bars)
              can never cover it; deliberately the boldest, only-labeled button here so
              it's the obvious next step for a first-time visitor. Shadow is a plain
              elevation shadow rather than a colored glow, to keep the header calm. */}
          <Link
            href="/report/new"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
            <span className="hidden sm:inline">{t('map.reportButton')}</span>
            <span className="sm:hidden">{t('map.reportButtonShort')}</span>
          </Link>
        </div>
        <div className="px-2 pb-2">
          <LocationSearch
            onSelect={(place) => mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 })}
            className="max-w-[180px]"
          />
        </div>
      </div>
      {status === 'paused' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white">
          {t('map.status.paused')}
        </div>
      )}
      {/* bottom-16, not bottom-4: MapLibre's own attribution control also lives in this
          corner (bottom-right) and can grow taller than its collapsed button on first
          load, before the user's first drag collapses it — this clears that. */}
      <div className="absolute bottom-16 right-2 z-10">
        <Legend />
      </div>
      {selectedReport && <PinSheet report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </div>
  );
}
