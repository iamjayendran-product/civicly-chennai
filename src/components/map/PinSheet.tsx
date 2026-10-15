'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import type { ReportPin } from '@/lib/realtime/useReports';

export interface PinSheetProps {
  report: ReportPin | null;
  onClose: () => void;
}

export function PinSheet({ report, onClose }: PinSheetProps) {
  // Remembers the last report shown, rather than unmounting when `report` goes back
  // to null, so closing can slide the sheet down instead of just vanishing — React
  // would otherwise remove it from the DOM before the transition had a chance to play.
  // Calling setState directly in the render body (not in an effect) is React's own
  // documented pattern for "adjust state when a prop changes": it re-renders
  // immediately, before the browser paints, so there's no extra commit or flash.
  const [shownReport, setShownReport] = useState<ReportPin | null>(report);
  if (report && report.id !== shownReport?.id) {
    setShownReport(report);
  }

  if (!shownReport) return null;

  const categoryLabel = t(`report.category.${shownReport.category}`);
  const subtypeLabel = shownReport.subtype ? t(`report.subtype.${shownReport.subtype}`) : null;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 rounded-t-2xl bg-surface p-4 shadow-lg transition-transform duration-300 ${
        report ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('pinSheet.close')}
        className="mb-2 text-sm text-muted transition-transform active:scale-90"
      >
        ✕
      </button>
      <h2 className="text-lg font-semibold">{subtypeLabel ?? categoryLabel}</h2>
      {shownReport.note && <p className="mt-1 text-sm text-foreground">{shownReport.note}</p>}
      <p className="mt-2 text-xs text-muted">
        {t(shownReport.status === 'fixed' ? 'report.status.fixed' : 'report.status.open')}
        {' · '}
        {t('pinSheet.upvotes', { count: shownReport.upvoteCount })}
      </p>
    </div>
  );
}
