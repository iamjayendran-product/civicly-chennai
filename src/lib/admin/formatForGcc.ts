import { t } from '@/lib/i18n';
import type { QueueRow } from './gccApi';

// Plain-text snippets for pasting into GCC's complaint form.

// 6 decimal places is ~10 cm — more than any phone GPS fix; Number() drops trailing zeros.
const round6 = (n: number) => Number(n.toFixed(6));

export function formatCoords(lat: number, lng: number): string {
  return `${round6(lat)}, ${round6(lng)}`;
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${round6(lat)},${round6(lng)}`;
}

export function formatDescription(row: QueueRow): string {
  const label = row.category === 'other' && row.subtype
    ? t(`report.subtype.${row.subtype}`)
    : t(`report.category.${row.category}`);
  return row.note ? `${label} — ${row.note}` : label;
}

export function formatAll(row: QueueRow, mapsLink: string): string {
  const dash = t('admin.card.noValue');
  return [
    formatDescription(row),
    formatCoords(row.lat, row.lng),
    mapsLink,
    row.reporter_name ?? dash,
    row.reporter_phone ?? dash,
  ].join('\n');
}
