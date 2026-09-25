'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { t } from '@/lib/i18n';
import type { ReportCategory } from '@/lib/report/validation';

interface Candidate {
  id: string;
  created_at: string;
  upvote_count: number;
}

export interface DuplicateListProps {
  lng: number;
  lat: number;
  category: ReportCategory;
  onContinue: () => void;
}

export function DuplicateList({ lng, lat, category, onContinue }: DuplicateListProps) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCandidates() {
      try {
        const { data, error } = await getBrowserClient().rpc('nearby_reports', {
          p_lng: lng,
          p_lat: lat,
          p_category: category,
        });
        if (cancelled) return;
        if (error) {
          // Non-critical feature (duplicate detection): fail open rather than block
          // reporting, but log it rather than silently treating "the request failed"
          // the same as "no duplicates found".
          console.error('[nearby_reports] failed:', error);
        }
        setCandidates((data as Candidate[] | null) ?? []);
      } catch (error) {
        if (!cancelled) {
          console.error('[nearby_reports] failed:', error);
          setCandidates([]);
        }
      }
    }
    loadCandidates();
    return () => {
      cancelled = true;
    };
  }, [lng, lat, category]);

  if (candidates === null) return null;
  if (candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <h3 className="text-sm font-medium">{t('report.duplicates.title')}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between text-sm">
            <span>{t('pinSheet.upvotes', { count: candidate.upvote_count })}</span>
            <span className="text-xs text-muted">{t('report.duplicates.signInToConfirm')}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onContinue} className="mt-2 text-sm font-medium text-secondary">
        {t('report.duplicates.continueAnyway')}
      </button>
    </div>
  );
}
