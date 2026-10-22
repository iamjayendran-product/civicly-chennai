import { t } from '@/lib/i18n';
import { gccComplaintTypeFor } from '@/lib/gcc/categoryMap';
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

// GCC's own complaint group and type for this report, as picked on GCC's form.
export function formatGccType(row: QueueRow): string {
  const type = gccComplaintTypeFor(row.category, row.subtype);
  return `${type.groupName} › ${type.name}`;
}

export function formatStreet(row: QueueRow): string {
  const dash = t('admin.card.noValue');
  if (!row.gcc_road_name && !row.gcc_street_id) return dash;
  return t('admin.card.street', { road: row.gcc_road_name ?? dash, id: row.gcc_street_id ?? dash });
}

export function formatWardZone(row: QueueRow): string {
  const dash = t('admin.card.noValue');
  return t('admin.card.wardZone', { ward: row.gcc_ward ?? dash, zone: row.gcc_zone ?? dash });
}

export function formatGender(row: QueueRow): string {
  return row.reporter_gender ? t(`report.contact.gender.${row.reporter_gender as 'male' | 'female' | 'transgender'}`) : t('admin.card.noValue');
}

// Everything GCC's complaint form asks for, labelled, one field per line.
export function formatAll(row: QueueRow, mapsLink: string): string {
  const dash = t('admin.card.noValue');
  return [
    formatDescription(row),
    t('admin.copyText.gccType', { value: formatGccType(row) }),
    t('admin.copyText.street', { value: formatStreet(row) }),
    formatWardZone(row),
    t('admin.copyText.landmark', { value: row.landmark ?? dash }),
    t('admin.copyText.location', { coords: formatCoords(row.lat, row.lng), link: mapsLink }),
    t('admin.copyText.name', { value: row.reporter_name ?? dash }),
    t('admin.copyText.phone', { value: row.reporter_phone ?? dash }),
    t('admin.copyText.gender', { value: formatGender(row) }),
  ].join('\n');
}
