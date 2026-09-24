'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CMDA_CENTER, CMDA_MAX_BOUNDS, boundsToBboxParams } from '@/lib/geo/cmda';
import { useReports, type ReportPin } from '@/lib/realtime/useReports';
import { Filters } from './Filters';
import { PinSheet } from './PinSheet';
import { LocationSearch } from './LocationSearch';
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

// MapLibre paint properties take literal color values, not CSS custom properties, so
// these can't reference globals.css's tokens directly — kept in sync by hand with
// --brand-primary (#ff3b30) and --muted (#8e8e93).
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
      properties: { id: report.id, status: report.status },
    })),
  };
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const reportsRef = useRef<ReportPin[]>([]);
  const [bbox, setBbox] = useState<ReturnType<typeof boundsToBboxParams> | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportPin | null>(null);

  const { reports, status } = useReports(bbox, showFixed);
  const visibleReports = selectedCategory ? reports.filter((r) => r.category === selectedCategory) : reports;

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [CMDA_CENTER.lng, CMDA_CENTER.lat],
      zoom: 10,
      maxBounds: CMDA_MAX_BOUNDS,
    });
    mapRef.current = map;
    // Zoom +/- and a compass (click to reset bearing/pitch, or drag to rotate). Bottom-left
    // avoids the top search/filter bar and the "Report a Grievance" button, both of which
    // already occupy the top and bottom-right/bottom-center.
    map.addControl(new maplibregl.NavigationControl(), 'bottom-left');

    function updateBboxFromMap() {
      setBbox(boundsToBboxParams(map.getBounds()));
    }

    map.on('load', () => {
      updateBboxFromMap();
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
          'circle-color': '#ff3b30',
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
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': ['match', ['get', 'status'], 'fixed', '#8e8e93', '#ff3b30'],
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
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
    <div className="relative h-dvh w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute top-0 w-full bg-surface/90 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 p-2">
          <LocationSearch
            onSelect={(place) => mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 })}
            className="max-w-[180px]"
          />
          {/* The primary call-to-action on this page — kept in the header row (not
              bottom-fixed) so browser chrome (address bar, bookmarks/download bars)
              can never cover it; deliberately the boldest, only-labeled button here so
              it's the obvious next step for a first-time visitor. */}
          <Link
            href="/report/new"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(255,59,48,0.45)] transition-transform hover:scale-105"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
            <span className="hidden sm:inline">{t('map.reportButton')}</span>
            <span className="sm:hidden">{t('map.reportButtonShort')}</span>
          </Link>
        </div>
        <Filters
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          showFixed={showFixed}
          onToggleShowFixed={setShowFixed}
        />
      </div>
      {status === 'paused' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-black/75 px-3 py-1 text-xs text-white">
          {t('map.status.paused')}
        </div>
      )}
      {selectedReport && <PinSheet report={selectedReport} onClose={() => setSelectedReport(null)} />}
    </div>
  );
}
