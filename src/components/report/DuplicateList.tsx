'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/browser';
import { t, errorCodeToMessage } from '@/lib/i18n';
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
  /** Called once the lookup finishes with nothing nearby, so a stepped flow can move on. */
  onNoDuplicates?: () => void;
  /** Called once an existing report has been successfully confirmed as the same issue. */
  onConfirmed: (reportId: string) => void;
}

export function DuplicateList({ lng, lat, category, onContinue, onNoDuplicates, onConfirmed }: DuplicateListProps) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

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

  async function handleConfirm(candidateId: string) {
    setConfirmingId(candidateId);
    setConfirmError(null);
    try {
      const { error } = await getBrowserClient().rpc('confirm_same_issue', { p_report_id: candidateId });
      if (error) {
        setConfirmError(errorCodeToMessage(error.message));
        return;
      }
      onConfirmed(candidateId);
    } catch (error) {
      console.error('[confirm_same_issue] failed:', error);
      setConfirmError(errorCodeToMessage('UNKNOWN'));
    } finally {
      setConfirmingId(null);
    }
  }

  const noneNearby = candidates !== null && candidates.length === 0;
  useEffect(() => {
    if (noneNearby) onNoDuplicates?.();
  }, [noneNearby, onNoDuplicates]);

  if (candidates === null) return <p className="text-xs text-muted">{t('report.duplicates.checking')}</p>;
  if (candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <h3 className="text-sm font-medium">{t('report.duplicates.title')}</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between text-sm">
            <span>{t('pinSheet.upvotes', { count: candidate.upvote_count })}</span>
            <button
              type="button"
              onClick={() => handleConfirm(candidate.id)}
              disabled={confirmingId !== null}
              className="text-xs font-medium text-secondary disabled:opacity-50"
            >
              {confirmingId === candidate.id ? t('report.duplicates.confirming') : t('report.duplicates.sameIssue')}
            </button>
          </li>
        ))}
      </ul>
      {confirmError && <p className="mt-2 text-xs text-primary">{confirmError}</p>}
      <button type="button" onClick={onContinue} className="mt-2 text-sm font-medium text-secondary">
        {t('report.duplicates.continueAnyway')}
      </button>
    </div>
  );
}
