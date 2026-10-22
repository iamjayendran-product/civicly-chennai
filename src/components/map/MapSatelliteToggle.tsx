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

/** The "Map | Satellite" switch from GCC's complaint form, plus a Light | Dark theme
 * switch under it while the Map view is on. */
export function MapSatelliteToggle({ value, onChange, is3d, onToggle3d }: MapSatelliteToggleProps) {
  const isSatellite = value === 'satellite';
  const options: { id: MapStyleId; label: string; pressed: boolean }[] = [
    // Coming back from Satellite opens the light theme (the default).
    { id: isSatellite ? 'light' : value, label: t('map.style.map'), pressed: !isSatellite },
    { id: 'satellite', label: t('map.style.satellite'), pressed: isSatellite },
  ];
  const themes: { id: MapStyleId; label: string }[] = [
    { id: 'light', label: t('map.style.light') },
    { id: 'dark', label: t('map.style.dark') },
  ];
  return (
    <div className="flex flex-col items-end gap-1.5">
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
      {!isSatellite && (
        <div className="flex overflow-hidden rounded-md bg-white text-xs shadow-md" role="group" aria-label={t('map.style.theme')}>
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              aria-pressed={value === theme.id}
              onClick={() => onChange(theme.id)}
              className={`px-2.5 py-1 ${value === theme.id ? 'font-semibold text-black' : 'text-neutral-500 hover:bg-neutral-100'}`}
            >
              {theme.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
