'use client';

import { t } from '@/lib/i18n';
import { getBrowserClient } from '@/lib/supabase/browser';
import { formatAll, formatCoords, formatDescription, mapsUrl } from '@/lib/admin/formatForGcc';
import { formatRelative } from '@/lib/admin/dates';
import { CopyButton } from './CopyButton';
import { GccFilingForm, type GccFilingFormProps } from './GccFilingForm';

export function GccReportCard({ row, onSaved }: GccFilingFormProps) {
  const storage = getBrowserClient().storage.from('report-photos');
  const maps = mapsUrl(row.lat, row.lng);
  const description = formatDescription(row);
  const coords = formatCoords(row.lat, row.lng);
  const dash = t('admin.card.noValue');

  return (
    <article className="rounded-2xl bg-surface p-4 shadow-sm">
      {row.photo_paths.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {row.photo_paths.map((path, i) => {
            const url = storage.getPublicUrl(path).data.publicUrl;
            return (
              <a key={path} href={url} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL, no optimisation needed */}
                <img src={url} alt={t('admin.card.photoAlt', { n: i + 1 })} className="h-24 w-24 rounded-lg object-cover" />
              </a>
            );
          })}
        </div>
      )}

      <h2 className="text-base font-semibold">{description}</h2>
      <p className="mt-1 text-xs text-muted">
        {t('admin.card.reported', { when: formatRelative(row.created_at) })}
        {row.upvote_count > 0 && (
          <>
            {' · '}
            <span>{t('admin.card.upvotes', { count: row.upvote_count })}</span>
          </>
        )}
      </p>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">📍</dt>
        <dd>
          {coords} ·{' '}
          <a href={maps} target="_blank" rel="noreferrer" className="text-primary underline">
            {t('admin.card.openMaps')}
          </a>
        </dd>
        <dt className="text-muted">👤</dt>
        <dd>{row.reporter_name ?? dash}</dd>
        <dt className="text-muted">📞</dt>
        <dd>{row.reporter_phone ?? dash}</dd>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton text={formatAll(row, maps)} label={t('admin.copy.all')} />
        <CopyButton text={description} label={t('admin.copy.description')} />
        <CopyButton text={coords} label={t('admin.copy.coords')} />
        <CopyButton text={maps} label={t('admin.copy.maps')} />
        {row.reporter_name && <CopyButton text={row.reporter_name} label={t('admin.copy.name')} />}
        {row.reporter_phone && <CopyButton text={row.reporter_phone} label={t('admin.copy.phone')} />}
      </div>

      <GccFilingForm row={row} onSaved={onSaved} />
    </article>
  );
}
