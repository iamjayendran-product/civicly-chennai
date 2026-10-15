'use client';

import { useCallback, useEffect, useState } from 'react';
import { isInServiceArea } from '@/lib/geo/serviceArea';
import { fetchStreetsNear, type GccStreet } from './streetLookup';

export type GccStreetsStatus = 'idle' | 'outside' | 'loading' | 'ok' | 'none' | 'error';

interface Lookup {
  /** Which pin position + attempt this result belongs to. */
  key: string;
  status: 'ok' | 'none' | 'error';
  streets: GccStreet[];
  selectedRoadId: string | null;
  landmark: string;
}

/** GCC streets near the report pin, the reporter's chosen street, and the landmark text —
 * the "Street" and "Landmark" fields of GCC's own complaint form. */
export function useGccStreets(location: { lng: number; lat: number } | null) {
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<Lookup | null>(null);

  const inArea = location !== null && isInServiceArea(location.lng, location.lat);
  const key = location ? `${location.lng},${location.lat}#${attempt}` : null;

  useEffect(() => {
    if (!location || !inArea || key === null) return;
    let cancelled = false;
    fetchStreetsNear(location.lng, location.lat).then((result) => {
      if (cancelled) return;
      const streets = result.status === 'ok' ? result.streets : [];
      setLookup({
        key,
        status: result.status,
        streets,
        selectedRoadId: streets[0]?.roadId ?? null,
        landmark: streets[0]?.roadName ?? '',
      });
    });
    return () => {
      cancelled = true;
    };
    // `key` already encodes location + attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, inArea]);

  const current = lookup && lookup.key === key ? lookup : null;
  const status: GccStreetsStatus = !location ? 'idle' : !inArea ? 'outside' : current ? current.status : 'loading';
  const streets = current?.streets ?? [];
  const selected = streets.find((s) => s.roadId === current?.selectedRoadId) ?? null;

  const selectStreet = useCallback((roadId: string) => {
    setLookup((prev) => {
      const next = prev?.streets.find((s) => s.roadId === roadId);
      return prev && next ? { ...prev, selectedRoadId: roadId, landmark: next.roadName } : prev;
    });
  }, []);

  const setLandmark = useCallback((landmark: string) => {
    setLookup((prev) => (prev ? { ...prev, landmark } : prev));
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, streets, selected, landmark: current?.landmark ?? '', selectStreet, setLandmark, retry };
}
