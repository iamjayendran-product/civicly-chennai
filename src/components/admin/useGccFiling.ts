'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import { gccApi, GccApiError, type GccStatus, type HistoryRow, type QueueRow } from '@/lib/admin/gccApi';
import { looksLikeGccComplaintId, normaliseComplaintId } from '@/lib/admin/complaintIdFormat';

export interface SavedInfo {
  duplicateOf: string[];
}

export type OnSaved = (row: QueueRow, info: SavedInfo) => void;
export type OnDeleted = (row: QueueRow) => void;

function errorMessage(error: unknown): string {
  const code = error instanceof GccApiError ? error.code : 'UNKNOWN';
  return code === 'AUTH_REQUIRED' || code === 'INVALID_INPUT' ? t(`admin.errors.${code}`) : t('admin.errors.UNKNOWN');
}

// Form state and actions for recording / editing one report's GCC filing. Shared by the
// phone card (GccFilingForm) and the wide-screen table row (GccTableRow).
export function useGccFiling(row: QueueRow, onSaved: OnSaved, onDeleted?: OnDeleted) {
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
  const canSave = trimmedId !== '' && !saving;

  async function save() {
    if (!canSave) return;
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

  // Soft delete (hidden from the public map), after the admin confirms.
  async function remove() {
    if (saving || !window.confirm(t('admin.deleteConfirm'))) return;
    setSaving(true);
    setError(null);
    try {
      await gccApi.deleteReport(row.id);
      onDeleted?.(row);
    } catch (err) {
      setError(errorMessage(err));
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

  return {
    isFiled, editing, setEditing,
    complaintId, setComplaintId, status, setStatus, note, setNote,
    saving, error, duplicateCount, history,
    showFormatWarning, canSave, save, remove, toggleHistory,
  };
}
