'use client';

import { Fragment, useState } from 'react';
import { t } from '@/lib/i18n';
import { getBrowserClient } from '@/lib/supabase/browser';
import { GCC_STATUSES, type GccStatus, type QueueRow } from '@/lib/admin/gccApi';
import { formatAll, formatCoords, formatDescription, formatGccType, formatGender, formatStreet, formatWardZone, mapsUrl } from '@/lib/admin/formatForGcc';
import { formatRelative, formatShortDate } from '@/lib/admin/dates';
import { CopyButton } from './CopyButton';
import { FilingFeedback } from './GccFilingForm';
import { useGccFiling, type OnDeleted, type OnSaved } from './useGccFiling';

// Wide-screen layout of the GCC queue: one compact row per report. Fixed column widths
// and wrapping text keep it inside the viewport; less-used details (big photos,
// single-field copies, note, history) live in an expandable row underneath.

const cell = 'px-3 py-2 align-top break-words';
const smallInput = 'w-full rounded-md border border-line bg-background px-2 py-1 text-sm';
const smallPrimary = 'rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white disabled:opacity-50';
const smallSecondary = 'rounded-full border border-line px-3 py-1 text-xs';
const smallDanger = 'rounded-full border border-red-600/50 px-3 py-1 text-xs text-red-600 disabled:opacity-50';

export function GccTable({ rows, onSaved, onDeleted }: { rows: QueueRow[]; onSaved: OnSaved; onDeleted: OnDeleted }) {
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col className="w-[31%]" />
        <col className="w-[13%]" />
        <col className="w-[15%]" />
        <col className="w-[22%]" />
        <col className="w-[19%]" />
      </colgroup>
      <thead>
        <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
          <th className={cell}>{t('admin.table.report')}</th>
          <th className={cell}>{t('admin.table.location')}</th>
          <th className={cell}>{t('admin.table.reporter')}</th>
          <th className={cell}>{t('admin.table.gcc')}</th>
          <th className={cell}>{t('admin.table.actions')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <GccTableRow key={row.id} row={row} onSaved={onSaved} onDeleted={onDeleted} />
        ))}
      </tbody>
    </table>
  );
}

function GccTableRow({ row, onSaved, onDeleted }: { row: QueueRow; onSaved: OnSaved; onDeleted: OnDeleted }) {
  const f = useGccFiling(row, onSaved, onDeleted);
  const [expanded, setExpanded] = useState(false);
  const storage = getBrowserClient().storage.from('report-photos');
  const photoUrls = row.photo_paths.map((p) => storage.getPublicUrl(p).data.publicUrl);
  const maps = mapsUrl(row.lat, row.lng);
  const description = formatDescription(row);
  const coords = formatCoords(row.lat, row.lng);
  const dash = t('admin.card.noValue');

  return (
    <Fragment>
      <tr data-testid={`gcc-row-${row.id}`} className={`bg-surface ${expanded ? '' : 'border-b border-line'}`}>
        <td className={cell}>
          <div className="flex gap-2">
            {photoUrls[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, no optimisation needed
              <img src={photoUrls[0]} alt={t('admin.card.photoAlt', { n: 1 })} className="h-12 w-12 shrink-0 rounded-md object-cover" />
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{description}</p>
              <p className="line-clamp-1 text-xs text-muted" title={t('admin.card.gccType')}>
                {formatGccType(row)}
              </p>
              <p className="text-xs text-muted">
                {formatRelative(row.created_at)}
                {row.upvote_count > 0 && (
                  <>
                    {' · '}
                    <span>{t('admin.card.upvotes', { count: row.upvote_count })}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </td>
        <td className={cell}>
          <p className="text-xs font-medium">{formatStreet(row)}</p>
          <p className="text-xs text-muted">{formatWardZone(row)}</p>
          {row.landmark && <p className="text-xs text-muted">{row.landmark}</p>}
          <p className="text-xs">{coords}</p>
          <a href={maps} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
            {t('admin.table.map')}
          </a>
        </td>
        <td className={cell}>
          <p>{row.reporter_name ?? dash}</p>
          <p className="text-xs text-muted">{row.reporter_phone ?? dash}</p>
          <p className="text-xs text-muted">{formatGender(row)}</p>
        </td>
        <td className={cell}>
          {f.editing ? (
            <div className="space-y-1">
              <input
                aria-label={t('admin.form.complaintId')}
                value={f.complaintId}
                onChange={(e) => f.setComplaintId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void f.save();
                }}
                placeholder={t('admin.form.complaintIdPlaceholder')}
                autoCapitalize="characters"
                className={smallInput}
              />
              {f.isFiled && (
                <select
                  aria-label={t('admin.form.status')}
                  value={f.status}
                  onChange={(e) => f.setStatus(e.target.value as GccStatus)}
                  className={smallInput}
                >
                  {GCC_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`admin.gccStatus.${s}`)}
                    </option>
                  ))}
                </select>
              )}
              {f.showFormatWarning && <p className="text-xs text-warning">{t('admin.form.formatWarning')}</p>}
            </div>
          ) : (
            <div>
              <p className="font-mono font-semibold">{row.complaint_id}</p>
              <p className="text-xs">
                {row.gcc_status && <span>{t(`admin.gccStatus.${row.gcc_status}`)}</span>}
                {row.filing_updated_at && <span className="text-muted"> · {formatShortDate(row.filing_updated_at)}</span>}
              </p>
            </div>
          )}
          <FilingFeedback duplicateCount={f.duplicateCount} error={f.error} history={null} />
        </td>
        <td className={cell}>
          <div className="flex flex-wrap gap-1">
            {f.editing ? (
              <>
                <button type="button" disabled={!f.canSave} onClick={() => void f.save()} className={smallPrimary}>
                  {f.isFiled ? t('admin.form.save') : t('admin.form.markFiled')}
                </button>
                {f.isFiled && (
                  <button type="button" onClick={() => f.setEditing(false)} className={smallSecondary}>
                    {t('admin.form.cancel')}
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={() => f.setEditing(true)} className={smallSecondary}>
                {t('admin.form.edit')}
              </button>
            )}
            <CopyButton text={formatAll(row, maps)} label={t('admin.copy.all')} />
            <button type="button" disabled={f.saving} onClick={() => void f.remove()} className={smallDanger}>
              {t('admin.delete')}
            </button>
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={t(expanded ? 'admin.table.less' : 'admin.table.more')}
              onClick={() => setExpanded((v) => !v)}
              className="rounded-full border border-line px-2 py-1 text-xs"
            >
              {expanded ? '▴' : '⋯'}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-line bg-surface">
          <td colSpan={5} className="px-3 pb-3">
            <div className="flex flex-wrap gap-4 rounded-lg bg-background p-3">
              {photoUrls.length > 0 && (
                <div className="flex gap-2">
                  {photoUrls.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
                      <img src={url} alt={t('admin.card.photoAlt', { n: i + 1 })} className="h-32 w-32 rounded-lg object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <div className="min-w-[16rem] flex-1 space-y-2">
                <div className="flex flex-wrap gap-1">
                  <CopyButton text={description} label={t('admin.copy.description')} />
                  <CopyButton text={coords} label={t('admin.copy.coords')} />
                  <CopyButton text={maps} label={t('admin.copy.maps')} />
                  {row.reporter_name && <CopyButton text={row.reporter_name} label={t('admin.copy.name')} />}
                  {row.reporter_phone && <CopyButton text={row.reporter_phone} label={t('admin.copy.phone')} />}
                </div>
                {f.editing ? (
                  <label className="block text-xs text-muted">
                    {t('admin.form.note')}
                    <textarea value={f.note} onChange={(e) => f.setNote(e.target.value)} maxLength={1000} rows={2} className={`mt-1 ${smallInput}`} />
                  </label>
                ) : (
                  row.gcc_note && <p className="text-xs">{row.gcc_note}</p>
                )}
                {f.isFiled && (
                  <>
                    <p className="text-xs text-muted">
                      {row.filed_at && t('admin.form.filedOn', { date: formatShortDate(row.filed_at) })}
                    </p>
                    <button type="button" onClick={f.toggleHistory} className={smallSecondary}>
                      {t('admin.form.history')}
                    </button>
                    <FilingFeedback duplicateCount={0} error={null} history={f.history} />
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
