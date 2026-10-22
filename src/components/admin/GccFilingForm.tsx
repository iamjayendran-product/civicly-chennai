'use client';

import { t } from '@/lib/i18n';
import { GCC_STATUSES, type GccStatus, type QueueRow } from '@/lib/admin/gccApi';
import { formatShortDate } from '@/lib/admin/dates';
import { useGccFiling, type OnSaved } from './useGccFiling';

export type { SavedInfo } from './useGccFiling';

export interface GccFilingFormProps {
  row: QueueRow;
  onSaved: OnSaved;
}

export const inputClass = 'mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm';
export const primaryButton = 'rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
export const secondaryButton = 'rounded-full border border-line px-4 py-2 text-sm';

export function GccFilingForm({ row, onSaved }: GccFilingFormProps) {
  const f = useGccFiling(row, onSaved);

  return (
    <div className="mt-3 border-t border-line pt-3">
      {f.editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void f.save();
          }}
          className="space-y-2"
        >
          <label className="block text-xs text-muted">
            {t('admin.form.complaintId')}
            <input
              value={f.complaintId}
              onChange={(e) => f.setComplaintId(e.target.value)}
              placeholder={t('admin.form.complaintIdPlaceholder')}
              autoCapitalize="characters"
              className={inputClass}
            />
          </label>
          {f.showFormatWarning && <p className="text-xs text-warning">{t('admin.form.formatWarning')}</p>}
          {f.isFiled && (
            <label className="block text-xs text-muted">
              {t('admin.form.status')}
              <select value={f.status} onChange={(e) => f.setStatus(e.target.value as GccStatus)} className={inputClass}>
                {GCC_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`admin.gccStatus.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs text-muted">
            {t('admin.form.note')}
            <textarea value={f.note} onChange={(e) => f.setNote(e.target.value)} maxLength={1000} rows={2} className={inputClass} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!f.canSave} className={primaryButton}>
              {f.isFiled ? t('admin.form.save') : t('admin.form.markFiled')}
            </button>
            {f.isFiled && (
              <button type="button" onClick={() => f.setEditing(false)} className={secondaryButton}>
                {t('admin.form.cancel')}
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="space-y-1 text-sm">
          <p className="font-mono font-semibold">{row.complaint_id}</p>
          <p className="text-xs text-muted">
            {row.gcc_status && t(`admin.gccStatus.${row.gcc_status}`)}
            {row.filed_at && ` · ${t('admin.form.filedOn', { date: formatShortDate(row.filed_at) })}`}
            {row.filing_updated_at && ` · ${t('admin.form.updatedOn', { date: formatShortDate(row.filing_updated_at) })}`}
          </p>
          {row.gcc_note && <p className="text-xs">{row.gcc_note}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => f.setEditing(true)} className={secondaryButton}>
              {t('admin.form.edit')}
            </button>
            <button type="button" onClick={f.toggleHistory} className={secondaryButton}>
              {t('admin.form.history')}
            </button>
          </div>
        </div>
      )}
      <FilingFeedback duplicateCount={f.duplicateCount} error={f.error} history={f.history} />
    </div>
  );
}

export function FilingFeedback({ duplicateCount, error, history }: Pick<ReturnType<typeof useGccFiling>, 'duplicateCount' | 'error' | 'history'>) {
  return (
    <>
      {duplicateCount > 0 && <p className="mt-2 text-xs text-warning">{t('admin.form.duplicate', { count: duplicateCount })}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      {history && (
        <ol className="mt-2 space-y-1 text-xs text-muted">
          {history.map((h, i) => (
            <li key={i}>
              {formatShortDate(h.created_at)} · {h.complaint_id} · {t(`admin.gccStatus.${h.status}`)}
              {h.note && ` · ${h.note}`}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
