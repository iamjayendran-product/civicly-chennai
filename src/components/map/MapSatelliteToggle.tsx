'use client';

import { t } from '@/lib/i18n';
import type { MapStyleId } from '@/lib/map/styles';

export interface MapSatelliteToggleProps {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
  /** Pass both to add a 3D (tilted view) button after Map | Satellite. */
  is3d?: boolean;
  onToggle3d?: (is3d: boolean) => void;
}

/** The "Map | Satellite" switch from GCC's complaint form, top-left of every map. */
export function MapSatelliteToggle({ value, onChange, is3d, onToggle3d }: MapSatelliteToggleProps) {
  const isSatellite = value === 'satellite';
  const options: { id: MapStyleId; label: string; pressed: boolean }[] = [
    { id: 'light', label: t('map.style.map'), pressed: !isSatellite },
    { id: 'satellite', label: t('map.style.satellite'), pressed: isSatellite },
  ];
  return (
    <div className="flex overflow-hidden rounded-md bg-white text-sm shadow-md" role="group" aria-label={t('map.style.title')}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.pressed}
          onClick={() => onChange(option.id)}
          className={`px-3 py-1.5 ${option.pressed ? 'font-semibold text-black' : 'text-neutral-500 hover:bg-neutral-100'}`}
        >
          {option.label}
        </button>
      ))}
      {onToggle3d && (
        <button
          type="button"
          aria-pressed={Boolean(is3d)}
          onClick={() => onToggle3d(!is3d)}
          className={`border-l border-neutral-200 px-3 py-1.5 ${is3d ? 'font-semibold text-black' : 'text-neutral-500 hover:bg-neutral-100'}`}
        >
          {t('map.style.view3d')}
        </button>
      )}
    </div>
  );
}
