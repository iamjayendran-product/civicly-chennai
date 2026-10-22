'use client';

import { useCallback, useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import {
  flagReports,
  listReports,
  retryGcc,
  setFlagReason,
  unflagReports,
  type AdminFilter,
  type AdminReport,
  type FlagReason,
} from '@/lib/admin/api';
import { AdminReportRow } from './AdminReportRow';
import { FlagToast } from './FlagToast';

const FILTERS: AdminFilter[] = ['pending', 'flagged', 'filed', 'failed', 'all'];
const SEARCH_DEBOUNCE_MS = 300;
/** Must match admin_list_reports' p_limit (src/lib/admin/api.ts). */
const PAGE_SIZE = 50;

interface Toast {
  ids: string[];
  alreadyFiled: string[];
  reason: FlagReason | null;
}

/** Every Civicly report with reporter details; one click flags a report (hidden from the
 * public map, never sent to GCC), with Undo and an optional reason. */
export function AdminReportsTable() {
  const [filter, setFilter] = useState<AdminFilter>('pending');
  const [search, setSearch] = useState('');
  const [ward, setWard] = useState('');
  const [query, setQuery] = useState({ search: '', ward: '' });
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Debounce typing in search/ward into the query that triggers a reload.
  useEffect(() => {
    const id = setTimeout(() => setQuery({ search, ward }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search, ward]);

  // Countdowns tick once a minute.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listReports({ filter, search: query.search, ward: query.ward })
      .then((rows) => {
        if (cancelled) return;
        setReports(rows);
        setHasMore(rows.length === PAGE_SIZE);
        setError(null);
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filter, query, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  async function loadMore() {
    const oldest = reports.at(-1);
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const rows = await listReports({ filter, search: query.search, ward: query.ward, before: oldest.created_at });
      setReports((prev) => [...prev, ...rows.filter((row) => !prev.some((p) => p.id === row.id))]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function flag(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const results = await flagReports(ids);
      setToast({
        ids,
        alreadyFiled: results.filter((r) => r.already_filed && r.complaint_number).map((r) => r.complaint_number!),
        reason: null,
      });
      setSelected(new Set());
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function unflag(ids: string[]) {
    try {
      await unflagReports(ids);
      setToast(null);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function pickReason(reason: FlagReason) {
    if (!toast) return;
    setToast({ ...toast, reason });
    await Promise.all(toast.ids.map((id) => setFlagReason(id, reason))).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err))
    );
    reload();
  }

  async function retry(id: string) {
    try {
      await retryGcc(id);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const minutesToNextRun = 5 - (now.getMinutes() % 5);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">{t('admin.filter.label')}</span>
          <select
            aria-label={t('admin.filter.label')}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as AdminFilter);
              setSelected(new Set());
              setExpandedId(null);
            }}
            className="rounded-xl border border-line bg-surface p-2"
          >
            {FILTERS.map((option) => (
              <option key={option} value={option}>
                {t(`admin.filter.${option}`)}
              </option>
            ))}
          </select>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={ward}
          onChange={(event) => setWard(event.target.value)}
          placeholder={t('admin.wardPlaceholder')}
          aria-label={t('admin.wardPlaceholder')}
          className="w-24 rounded-xl border border-line bg-surface p-2 text-sm"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('admin.searchPlaceholder')}
          aria-label={t('admin.searchPlaceholder')}
          className="min-w-40 flex-1 rounded-xl border border-line bg-surface p-2 text-sm"
        />
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => flag(Array.from(selected))}
          className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {t('admin.flagSelected', { count: selected.size })}
        </button>
      </div>
      <p className="text-xs text-muted">{t('admin.nextRun', { minutes: minutesToNextRun })}</p>
      {error && <p className="text-sm text-primary">{error}</p>}
      <table className="w-full border-collapse text-left text-sm">
        <thead className="text-xs uppercase text-muted">
          <tr className="border-b border-line">
            <th className="p-2" aria-label={t('admin.col.select')} />
            <th className="p-2">{t('admin.col.photo')}</th>
            <th className="p-2">{t('admin.col.category')}</th>
            <th className="p-2">{t('admin.col.reporter')}</th>
            <th className="hidden p-2 md:table-cell">{t('admin.col.phone')}</th>
            <th className="hidden p-2 md:table-cell">{t('admin.col.ward')}</th>
            <th className="p-2">{t('admin.col.gcc')}</th>
            <th className="p-2" aria-label={t('admin.col.action')} />
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <AdminReportRow
              key={report.id}
              report={report}
              now={now}
              selected={selected.has(report.id)}
              expanded={expandedId === report.id}
              onToggleSelected={() => toggleSelected(report.id)}
              onToggleExpanded={() => setExpandedId((id) => (id === report.id ? null : report.id))}
              onFlag={() => flag([report.id])}
              onUnflag={() => unflag([report.id])}
              onRetry={() => retry(report.id)}
            />
          ))}
        </tbody>
      </table>
      {!loading && reports.length === 0 && <p className="p-4 text-center text-sm text-muted">{t('admin.empty')}</p>}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-center rounded-xl border border-line px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t('admin.loadMore')}
        </button>
      )}
      {toast && (
        <FlagToast
          count={toast.ids.length}
          alreadyFiled={toast.alreadyFiled}
          reason={toast.reason}
          onReason={pickReason}
          onUndo={() => unflag(toast.ids)}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
