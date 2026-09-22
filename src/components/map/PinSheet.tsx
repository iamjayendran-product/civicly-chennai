'use client';

import { t } from '@/lib/i18n';
import type { ReportPin } from '@/lib/realtime/useReports';

export interface PinSheetProps {
  report: ReportPin;
  onClose: () => void;
}

export function PinSheet({ report, onClose }: PinSheetProps) {
  const categoryLabel = t(`report.category.${report.category}`);
  const subtypeLabel = report.subtype ? t(`report.subtype.${report.subtype}`) : null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 rounded-t-2xl bg-white p-4 shadow-lg">
      <button type="button" onClick={onClose} className="mb-2 text-sm text-gray-500">
        ✕
      </button>
      <h2 className="text-lg font-semibold">{subtypeLabel ?? categoryLabel}</h2>
      {report.note && <p className="mt-1 text-sm text-gray-700">{report.note}</p>}
      <p className="mt-2 text-xs text-gray-500">
        {report.status === 'fixed' ? 'Fixed' : 'Open'} · {report.upvoteCount} +1
      </p>
    </div>
  );
}
