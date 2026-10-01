'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import { MAP_COLORS } from '@/lib/map/colors';

// Explains only the status colors (open/fixed), because that's the one color rule the
// spec actually defines (§4.2); per-category colors are already labelled with text in
// the filter chips, so repeating them here would be redundant for a "simple" legend.
export function Legend() {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label={t('map.legend.toggle')}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface/80 text-sm font-semibold text-muted shadow-md backdrop-blur-sm transition-transform active:scale-90"
      >
        i
      </button>
    );
  }

  return (
    <div className="w-40 rounded-xl bg-surface/90 p-3 text-xs shadow-md backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold text-foreground">{t('map.legend.title')}</p>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label={t('map.legend.toggle')}
          className="text-muted transition-transform active:scale-90"
        >
          ✕
        </button>
      </div>
      <LegendRow color={MAP_COLORS.pothole} label={t('report.status.open')} />
      <LegendRow color={MAP_COLORS.fixed} label={t('report.status.fixed')} />
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-foreground">{label}</span>
    </div>
  );
}
