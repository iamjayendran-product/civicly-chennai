'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { photoUrl, reporterReports, type AdminReport, type ReporterReport } from '@/lib/admin/api';
import { GccStatusChip } from './GccStatusChip';

export interface AdminReportRowProps {
  report: AdminReport;
  now: Date;
  selected: boolean;
  expanded: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onFlag: () => void;
  onUnflag: () => void;
  onRetry: () => void;
}

const GENDERS = ['male', 'female', 'transgender'] as const;

function categoryLabel(report: Pick<AdminReport, 'category' | 'subtype'>) {
  return report.category === 'other' && report.subtype ? t(`report.subtype.${report.subtype}`) : t(`report.category.${report.category}`);
}

export function AdminReportRow({
  report,
  now,
  selected,
  expanded,
  onToggleSelected,
  onToggleExpanded,
  onFlag,
  onUnflag,
  onRetry,
}: AdminReportRowProps) {
  const name = report.reporter_name ?? t('admin.anonymous');
  const flagged = report.is_hidden || report.gcc_status === 'blocked';
  const chip = {
    status: report.gcc_status,
    nextAttemptAt: report.next_attempt_at,
    complaintNumber: report.complaint_number,
    blockedReason: report.blocked_reason,
  };

  return (
    <>
      <tr onClick={onToggleExpanded} className={`cursor-pointer border-b border-line hover:bg-surface-muted ${flagged ? 'opacity-70' : ''}`}>
        <td className="p-2" onClick={(event) => event.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggleSelected} aria-label={t('admin.select', { name })} />
        </td>
        <td className="p-2">
          {report.photo_paths[0] ? (
            // eslint-disable-next-line @next/next/no-img-element -- Storage URLs, thumbnails only
            <img src={photoUrl(report.photo_paths[0])} alt="" className="h-10 w-10 rounded-md object-cover" />
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="p-2">{categoryLabel(report)}</td>
        <td className="p-2">
          <span className="font-medium">{name}</span> <span className="text-muted">({report.reporter_report_count})</span>
        </td>
        <td className="hidden p-2 md:table-cell">{report.reporter_phone ?? '—'}</td>
        <td className="hidden p-2 md:table-cell">{report.gcc_ward ?? '—'}</td>
        <td className="p-2">
          <GccStatusChip input={chip} now={now} />
        </td>
        <td className="p-2 text-right" onClick={(event) => event.stopPropagation()}>
          {flagged ? (
            <button type="button" onClick={onUnflag} className="rounded-lg border border-line px-2 py-1 text-xs font-medium">
              {t('admin.undo')}
            </button>
          ) : (
            <button type="button" onClick={onFlag} className="rounded-lg bg-primary px-2 py-1 text-xs font-semibold text-white">
              {t('admin.flag')}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface-muted/50">
          <td colSpan={8} className="p-3">
            <ReportDetails report={report} onRetry={onRetry} />
          </td>
        </tr>
      )}
    </>
  );
}

function ReportDetails({ report, onRetry }: { report: AdminReport; onRetry: () => void }) {
  const [others, setOthers] = useState<ReporterReport[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    reporterReports(report.id)
      .then((rows) => !cancelled && setOthers(rows))
      .catch(() => !cancelled && setOthers([]));
    return () => {
      cancelled = true;
    };
  }, [report.id]);

  const gender = GENDERS.find((g) => g === report.gender);
  const mapHref = `https://www.openstreetmap.org/?mlat=${report.lat}&mlon=${report.lng}#map=18/${report.lat}/${report.lng}`;

  return (
    <div className="grid gap-3 text-sm md:grid-cols-[auto,1fr,1fr]">
      <div className="flex flex-wrap gap-2">
        {report.photo_paths.map((path) => (
          <a key={path} href={photoUrl(path)} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element -- Storage URLs */}
            <img src={photoUrl(path)} alt={t('admin.photoAlt')} className="h-32 w-32 rounded-lg object-cover" />
          </a>
        ))}
      </div>
      <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
        <dt className="text-muted">{t('admin.detail.note')}</dt>
        <dd>{report.note || '—'}</dd>
        <dt className="text-muted">{t('report.location.street')}</dt>
        <dd>
          {report.gcc_road_name ?? '—'}
          {report.gcc_ward && ` · ${t('admin.detail.wardZone', { ward: report.gcc_ward, zone: report.gcc_zone ?? '—' })}`}
        </dd>
        <dt className="text-muted">{t('report.location.landmark')}</dt>
        <dd>{report.landmark || '—'}</dd>
        <dt className="text-muted">{t('report.contact.gender')}</dt>
        <dd>{gender ? t(`report.contact.gender.${gender}`) : '—'}</dd>
        <dt className="text-muted">{t('admin.detail.reported')}</dt>
        <dd>{new Date(report.created_at).toLocaleString('en-IN')}</dd>
        <dd className="col-span-2">
          <a href={mapHref} target="_blank" rel="noreferrer" className="text-secondary underline">
            {t('admin.openMap')}
          </a>
        </dd>
      </dl>
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-muted">{t('admin.detail.gcc')}</p>
          {report.complaint_number && <p className="font-medium">#{report.complaint_number}</p>}
          {report.last_error && <p className="text-warning">{report.last_error}</p>}
          {report.gcc_status === 'failed' && (
            <button type="button" onClick={onRetry} className="mt-1 rounded-lg border border-line px-2 py-1 text-xs font-medium">
              {t('admin.retry')}
            </button>
          )}
        </div>
        <div>
          <p className="text-muted">{t('admin.detail.otherReports')}</p>
          {others === null ? (
            <p className="text-xs text-muted">…</p>
          ) : others.length === 0 ? (
            <p className="text-xs text-muted">{t('admin.detail.noOtherReports')}</p>
          ) : (
            <ul className="text-xs">
              {others.map((other) => (
                <li key={other.id}>
                  <span>{categoryLabel(other)}</span>
                  <span className="text-muted">
                    {' · '}
                    {new Date(other.created_at).toLocaleDateString('en-IN')}
                    {other.is_hidden ? ` · ${t('admin.gcc.flagged')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
