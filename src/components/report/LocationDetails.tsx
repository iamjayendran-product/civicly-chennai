'use client';

import { t } from '@/lib/i18n';
import type { GccStreet } from '@/lib/gcc/streetLookup';
import type { GccStreetsStatus } from '@/lib/gcc/useGccStreets';

export interface LocationDetailsProps {
  location: { lng: number; lat: number } | null;
  status: GccStreetsStatus;
  streets: GccStreet[];
  selectedRoadId: string | null;
  landmark: string;
  onSelectStreet: (roadId: string) => void;
  onChangeLandmark: (landmark: string) => void;
  onRetry: () => void;
}

const fieldClass = 'min-w-0 rounded-xl border border-line bg-surface p-2 text-sm';
const labelClass = 'flex min-w-0 flex-col gap-0.5 text-xs font-medium text-muted';

/** The Street / Landmark / Latitude / Longitude fields under the map — the same fields as
 * GCC's own complaint form, filled from GCC's street register for the pin. */
export function LocationDetails({
  location,
  status,
  streets,
  selectedRoadId,
  landmark,
  onSelectStreet,
  onChangeLandmark,
  onRetry,
}: LocationDetailsProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <label className={labelClass}>
          {t('report.location.street')}
          <select
            value={selectedRoadId ?? ''}
            onChange={(event) => onSelectStreet(event.target.value)}
            disabled={status !== 'ok'}
            className={fieldClass}
          >
            {status !== 'ok' && <option value="">{t('report.location.selectStreet')}</option>}
            {streets.map((street) => (
              <option key={street.roadId} value={street.roadId}>
                {street.roadName}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          {t('report.location.landmark')}
          <input
            type="text"
            value={landmark}
            onChange={(event) => onChangeLandmark(event.target.value)}
            maxLength={120}
            disabled={status !== 'ok'}
            className={fieldClass}
          />
        </label>
        <label className={labelClass}>
          {t('report.location.latitude')}
          <input type="text" readOnly value={location ? location.lat.toFixed(6) : ''} className={`${fieldClass} text-muted`} />
        </label>
        <label className={labelClass}>
          {t('report.location.longitude')}
          <input type="text" readOnly value={location ? location.lng.toFixed(6) : ''} className={`${fieldClass} text-muted`} />
        </label>
      </div>
      {status === 'idle' && <p className="text-xs text-muted">{t('report.errors.LOCATION_REQUIRED')}</p>}
      {status === 'loading' && <p className="text-xs text-muted">{t('report.location.loadingStreets')}</p>}
      {status === 'outside' && <p className="text-xs text-warning">{t('report.errors.OUTSIDE_GCC')}</p>}
      {status === 'none' && <p className="text-xs text-warning">{t('report.location.noStreet')}</p>}
      {status === 'error' && (
        <p className="flex items-center gap-2 text-xs text-warning">
          {t('report.location.streetLookupFailed')}
          <button type="button" onClick={onRetry} className="rounded-lg border border-line px-2 py-0.5 font-medium">
            {t('report.location.retry')}
          </button>
        </p>
      )}
    </div>
  );
}
