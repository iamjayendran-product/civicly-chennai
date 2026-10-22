'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import { gccApi, GccApiError, GCC_STATUSES, type GccStatus, type HistoryRow, type QueueRow } from '@/lib/admin/gccApi';
import { looksLikeGccComplaintId, normaliseComplaintId } from '@/lib/admin/complaintIdFormat';
import { formatShortDate } from '@/lib/admin/dates';

export interface SavedInfo {
  duplicateOf: string[];
}

export interface GccFilingFormProps {
  row: QueueRow;
  onSaved: (row: QueueRow, info: SavedInfo) => void;
}

function errorMessage(error: unknown): string {
  const code = error instanceof GccApiError ? error.code : 'UNKNOWN';
  return code === 'AUTH_REQUIRED' || code === 'INVALID_INPUT' ? t(`admin.errors.${code}`) : t('admin.errors.UNKNOWN');
}

const inputClass = 'mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm';
const primaryButton = 'rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const secondaryButton = 'rounded-full border border-line px-4 py-2 text-sm';

export function GccFilingForm({ row, onSaved }: GccFilingFormProps) {
  const isFiled = row.complaint_id !== null;
  const [editing, setEditing] = useState(!isFiled);
  const [complaintId, setComplaintId] = useState(row.complaint_id ?? '');
  const [status, setStatus] = useState<GccStatus>(row.gcc_status ?? 'registered');
  const [note, setNote] = useState(row.gcc_note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  const trimmedId = complaintId.trim();
  const showFormatWarning = trimmedId !== '' && !looksLikeGccComplaintId(normaliseComplaintId(trimmedId));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const args: Parameters<typeof gccApi.save>[0] = { reportId: row.id, complaintId: trimmedId, status };
      if (note.trim() !== '') args.note = note.trim();
      const info = await gccApi.save(args);
      const now = new Date().toISOString();
      const saved: QueueRow = {
        ...row,
        complaint_id: normaliseComplaintId(trimmedId),
        gcc_status: status,
        gcc_note: note.trim() || null,
        filed_at: row.filed_at ?? now,
        filing_updated_at: now,
        sort_key: now,
      };
      setDuplicateCount(info.duplicateOf.length);
      setHistory(null);
      if (isFiled) setEditing(false);
      onSaved(saved, info);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    try {
      setHistory(await gccApi.history(row.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      {editing ? (
        <form onSubmit={submit} className="space-y-2">
          <label className="block text-xs text-muted">
            {t('admin.form.complaintId')}
            <input
              value={complaintId}
              onChange={(e) => setComplaintId(e.target.value)}
              placeholder={t('admin.form.complaintIdPlaceholder')}
              autoCapitalize="characters"
              className={inputClass}
            />
          </label>
          {showFormatWarning && <p className="text-xs text-warning">{t('admin.form.formatWarning')}</p>}
          {isFiled && (
            <label className="block text-xs text-muted">
              {t('admin.form.status')}
              <select value={status} onChange={(e) => setStatus(e.target.value as GccStatus)} className={inputClass}>
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
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className={inputClass} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={trimmedId === '' || saving} className={primaryButton}>
              {isFiled ? t('admin.form.save') : t('admin.form.markFiled')}
            </button>
            {isFiled && (
              <button type="button" onClick={() => setEditing(false)} className={secondaryButton}>
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
            <button type="button" onClick={() => setEditing(true)} className={secondaryButton}>
              {t('admin.form.edit')}
            </button>
            <button type="button" onClick={toggleHistory} className={secondaryButton}>
              {t('admin.form.history')}
            </button>
          </div>
        </div>
      )}
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
    </div>
  );
}
