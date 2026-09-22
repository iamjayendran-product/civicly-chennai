'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import type { BboxParams } from '@/lib/geo/cmda';
import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];
type Subtype = Database['public']['Enums']['report_subtype'];
type Status = Database['public']['Enums']['report_status'];

export interface ReportPin {
  id: string;
  category: Category;
  subtype: Subtype | null;
  note: string | null;
  lng: number;
  lat: number;
  status: Status;
  upvoteCount: number;
  createdAt: string;
}

interface BboxRow {
  id: string;
  category: Category;
  subtype: Subtype | null;
  note: string | null;
  lng: number;
  lat: number;
  status: Status;
  upvote_count: number;
  created_at: string;
}

interface RealtimeReportRow extends BboxRow {
  is_hidden: boolean;
}

function bboxRowToPin(row: BboxRow): ReportPin {
  return {
    id: row.id,
    category: row.category,
    subtype: row.subtype,
    note: row.note,
    lng: row.lng,
    lat: row.lat,
    status: row.status,
    upvoteCount: row.upvote_count,
    createdAt: row.created_at,
  };
}

function isWithinBbox(pin: ReportPin, bbox: BboxParams): boolean {
  return pin.lng >= bbox.minLng && pin.lng <= bbox.maxLng && pin.lat >= bbox.minLat && pin.lat <= bbox.maxLat;
}

export function useReports(bbox: BboxParams | null, includeFixed: boolean) {
  const [reports, setReports] = useState<Map<string, ReportPin>>(new Map());
  const [status, setStatus] = useState<'loading' | 'live' | 'paused'>('loading');

  useEffect(() => {
    if (!bbox) return;
    const supabase = getBrowserClient();
    let cancelled = false;
    // Reset to 'loading' whenever bbox/includeFixed change and a new snapshot fetch
    // starts; this is a deliberate synchronous reset, not state derived from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading');

    supabase
      .rpc('reports_in_bbox', {
        p_min_lng: bbox.minLng,
        p_min_lat: bbox.minLat,
        p_max_lng: bbox.maxLng,
        p_max_lat: bbox.maxLat,
        p_include_fixed: includeFixed,
      })
      .then(({ data, error }: { data: BboxRow[] | null; error: unknown }) => {
        if (cancelled) return;
        if (error) {
          setStatus('paused');
          return;
        }
        setReports(new Map((data ?? []).map((row) => [row.id, bboxRowToPin(row)])));
        setStatus('live');
      });

    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload: { new: RealtimeReportRow }) => {
        const row = payload.new;
        if (row.is_hidden || (!includeFixed && row.status === 'fixed')) return;
        const pin = bboxRowToPin(row);
        if (!isWithinBbox(pin, bbox)) return;
        setReports((prev) => new Map(prev).set(pin.id, pin));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reports' }, (payload: { new: RealtimeReportRow }) => {
        const row = payload.new;
        const pin = bboxRowToPin(row);
        setReports((prev) => {
          const next = new Map(prev);
          const shouldShow = !row.is_hidden && (includeFixed || row.status === 'open') && isWithinBbox(pin, bbox);
          if (shouldShow) {
            next.set(pin.id, pin);
          } else {
            next.delete(pin.id);
          }
          return next;
        });
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [bbox?.minLng, bbox?.minLat, bbox?.maxLng, bbox?.maxLat, includeFixed, bbox]);

  return { reports: Array.from(reports.values()), status };
}
