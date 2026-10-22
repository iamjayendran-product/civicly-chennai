'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { gccApi, GCC_STATUSES, type GccStatus, type QueueRow } from '@/lib/admin/gccApi';
import { GccReportCard } from './GccReportCard';
import { GccTable } from './GccTable';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useMediaQuery } from './useMediaQuery';
import type { SavedInfo } from './GccFilingForm';

type Tab = 'unfiled' | 'filed';

// Matches admin_gcc_queue's default p_limit: a full page means there may be more.
const PAGE_SIZE = 20;

function queueArgs(tab: Tab, status: GccStatus | null, before?: string) {
  const args: Parameters<typeof gccApi.queue>[0] = { tab };
  if (tab === 'filed' && status) args.status = status;
  if (before) args.before = before;
  return args;
}

export function GccQueue() {
  const [tab, setTab] = useState<Tab>('unfiled');
  const [status, setStatus] = useState<GccStatus | null>(null);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [counts, setCounts] = useState<{ unfiled: number; filed: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const router = useRouter();
  const wide = useMediaQuery('(min-width: 768px)');
  const loadingMore = useRef(false);
  const viewKey = `${tab}|${status ?? ''}|${reloadKey}`;
  const currentView = useRef(viewKey);
  useEffect(() => {
    currentView.current = viewKey;
  }, [viewKey]);

  const refreshCounts = useCallback(() => {
    gccApi.counts().then(setCounts, () => setFailed(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshCounts();
    gccApi.queue(queueArgs(tab, status)).then(
      (page) => {
        if (cancelled) return;
        setRows(page);
        setHasMore(page.length === PAGE_SIZE);
        setFailed(false);
      },
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [tab, status, reloadKey, refreshCounts]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  function switchTab(next: Tab) {
    if (next === tab) return;
    setRows(null);
    setStatus(null);
    setTab(next);
  }

  async function loadMore() {
    if (!rows || rows.length === 0 || loadingMore.current) return;
    loadingMore.current = true;
    const view = viewKey;
    try {
      const page = await gccApi.queue(queueArgs(tab, status, rows[rows.length - 1].sort_key));
      // A tab or filter switch while this was in flight makes the page stale.
      if (currentView.current !== view) return;
      setRows((current) => {
        const seen = new Set((current ?? []).map((r) => r.id));
        return [...(current ?? []), ...page.filter((r) => !seen.has(r.id))];
      });
      setHasMore(page.length === PAGE_SIZE);
    } catch {
      setFailed(true);
    } finally {
      loadingMore.current = false;
    }
  }

  function handleSaved(saved: QueueRow, info: SavedInfo) {
    setRows((current) =>
      tab === 'unfiled'
        ? (current ?? []).filter((r) => r.id !== saved.id)
        : (current ?? []).map((r) => (r.id === saved.id ? saved : r)),
    );
    const message = t('admin.form.saved', { id: saved.complaint_id ?? '' });
    setToast(info.duplicateOf.length > 0 ? `${message} · ${t('admin.form.duplicate', { count: info.duplicateOf.length })}` : message);
    refreshCounts();
  }

  function handleDeleted(deleted: QueueRow) {
    setRows((current) => (current ?? []).filter((r) => r.id !== deleted.id));
    setToast(t('admin.deleted'));
    refreshCounts();
  }

  async function signOut() {
    await getBrowserClient().auth.signOut();
    router.replace('/admin/login');
  }

  const tabClass = (active: boolean) =>
    `flex-1 rounded-full px-3 py-2 text-sm font-semibold ${active ? 'bg-primary text-white' : 'bg-surface text-foreground'}`;
  const chipClass = (active: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs ${active ? 'border-primary bg-primary/10 text-primary' : 'border-line text-muted'}`;

  return (
    <div className={`mx-auto space-y-3 p-4 ${wide ? 'max-w-7xl' : 'max-w-xl'}`}>
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('admin.title')}</h1>
        <div className="flex gap-4">
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="text-sm text-primary">
            {t('admin.refresh')}
          </button>
          <button type="button" onClick={() => void signOut()} className="text-sm text-muted">
            {t('admin.signOut')}
          </button>
        </div>
      </header>

      <div role="tablist" className={`flex gap-2 ${wide ? 'max-w-md' : ''}`}>
        <button role="tab" aria-selected={tab === 'unfiled'} onClick={() => switchTab('unfiled')} className={tabClass(tab === 'unfiled')}>
          {t('admin.tab.unfiled', { count: counts?.unfiled ?? '…' })}
        </button>
        <button role="tab" aria-selected={tab === 'filed'} onClick={() => switchTab('filed')} className={tabClass(tab === 'filed')}>
          {t('admin.tab.filed', { count: counts?.filed ?? '…' })}
        </button>
      </div>

      {tab === 'filed' && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" aria-pressed={status === null} onClick={() => setStatus(null)} className={chipClass(status === null)}>
            {t('admin.filter.all')}
          </button>
          {GCC_STATUSES.map((s) => (
            <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)} className={chipClass(status === s)}>
              {t(`admin.gccStatus.${s}`)}
            </button>
          ))}
        </div>
      )}

      {failed && <p role="alert" className="text-sm text-red-600">{t('admin.errors.UNKNOWN')}</p>}

      {rows?.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">{t(tab === 'unfiled' ? 'admin.empty.unfiled' : 'admin.empty.filed')}</p>
      )}

      {wide ? (
        rows && rows.length > 0 && <GccTable rows={rows} onSaved={handleSaved} onDeleted={handleDeleted} />
      ) : (
        <div className="space-y-3">
          {rows?.map((row) => <GccReportCard key={row.id} row={row} onSaved={handleSaved} onDeleted={handleDeleted} />)}
        </div>
      )}

      {hasMore && (
        <button type="button" onClick={loadMore} className="mx-auto block w-full max-w-md rounded-full border border-line py-2 text-sm">
          {t('admin.loadMore')}
        </button>
      )}

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-4 mx-auto max-w-md rounded-full bg-foreground px-4 py-2 text-center text-sm text-background shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
