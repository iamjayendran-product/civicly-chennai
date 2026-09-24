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
          'circle-color': '#dc2626',
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
          'circle-color': ['match', ['get', 'status'], 'fixed', '#9ca3af', '#dc2626'],
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
      <div className="absolute top-0 w-full bg-white/90">
        <Filters
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          showFixed={showFixed}
          onToggleShowFixed={setShowFixed}
        />
      </div>
      {status === 'paused' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/80 px-3 py-1 text-xs text-white">
          {t('map.status.paused')}
        </div>
      )}
      {selectedReport && <PinSheet report={selectedReport} onClose={() => setSelectedReport(null)} />}
      <Link
        href="/report/new"
        aria-label={t('map.reportButton')}
        className="absolute bottom-6 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-3xl font-semibold text-white shadow-lg"
      >
        +
      </Link>
    </div>
  );
}
