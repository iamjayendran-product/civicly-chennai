'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import { MAP_STYLES, type MapStyleId } from '@/lib/map/styles';

export interface MapStyleSwitcherProps {
  value: MapStyleId;
  onChange: (id: MapStyleId) => void;
  is3d: boolean;
  onToggle3d: (is3d: boolean) => void;
}

/** Floating "layers" button that opens a small menu of basemap views. */
export function MapStyleSwitcher({ value, onChange, is3d, onToggle3d }: MapStyleSwitcherProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      {open && (
        <div role="menu" aria-label={t('map.style.title')} className="w-36 rounded-xl bg-surface/90 p-1.5 text-sm shadow-md backdrop-blur-sm">
          {MAP_STYLES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === value}
              onClick={() => {
                onChange(option.id);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                option.id === value ? 'bg-primary/15 font-semibold text-primary' : 'text-foreground'
              }`}
            >
              {t(option.labelKey)}
              {option.id === value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={is3d}
            onClick={() => onToggle3d(!is3d)}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
              is3d ? 'bg-primary/15 font-semibold text-primary' : 'text-foreground'
            }`}
          >
            {t('map.style.view3d')}
            {is3d && <span aria-hidden="true">✓</span>}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('map.style.title')}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-foreground shadow-md backdrop-blur-sm transition-transform active:scale-90"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3 3 8l9 5 9-5-9-5z" />
          <path d="m3 13 9 5 9-5" />
        </svg>
      </button>
    </div>
  );
}
