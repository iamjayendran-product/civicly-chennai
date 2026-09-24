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
    getBrowserClient()
      .rpc('nearby_reports', { p_lng: lng, p_lat: lat, p_category: category })
      .then(({ data }: { data: Candidate[] | null }) => {
        if (!cancelled) setCandidates(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [lng, lat, category]);

  if (candidates === null) return null;
  if (candidates.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <h3 className="text-sm font-medium">{t('report.duplicates.title')}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between text-sm">
            <span>{t('pinSheet.upvotes', { count: candidate.upvote_count })}</span>
            <span className="text-xs text-gray-500">{t('report.duplicates.signInToConfirm')}</span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onContinue} className="mt-2 text-sm text-red-600">
        {t('report.duplicates.continueAnyway')}
      </button>
    </div>
  );
}
