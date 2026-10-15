import type { ReportCategory, ReportSubtype } from '@/lib/report/validation';
import { t } from '@/lib/i18n';
import { gccComplaintTypeFor } from './categoryMap';

/** One row returned by the claim_gcc_submissions RPC. */
export interface ClaimedSubmission {
  report_id: string;
  category: ReportCategory;
  subtype: ReportSubtype | null;
  note: string | null;
  lng: number;
  lat: number;
  gcc_street_id: string | null;
  gcc_road_name: string | null;
  gcc_zone: string | null;
  gcc_ward: string | null;
  landmark: string | null;
  reporter_name: string | null;
  gender: string;
  photo_path: string | null;
}

export interface BuildPayloadOptions {
  /** Public site origin, for the link to the live report. */
  siteUrl: string;
  /** Public URL of the report photo, if any. */
  photoUrl: string | null;
  /** The photo as a data: URL under 1 MB, or null to send none. */
  imageDataUrl: string | null;
}

const ANONYMOUS_NAME = 'Anonymous (via Civicly Chennai)';

/** The form fields of POST gccservices.in/pgr/api/register — the same fields GCC's own
 * complaint form sends. Mobile and email are always empty: Civicly files anonymously,
 * which is what GCC's form does when "share mobile/email" is No (no OTP). */
export function buildGccPayload(row: ClaimedSubmission, opts: BuildPayloadOptions): Record<string, string> {
  const type = gccComplaintTypeFor(row.category, row.subtype);
  const road = row.gcc_road_name ?? '';
  const issue =
    row.category === 'other' && row.subtype ? t(`report.subtype.${row.subtype}`) : t(`report.category.${row.category}`);
  const area = [row.gcc_ward && `Ward ${row.gcc_ward}`, row.gcc_zone && `Zone ${row.gcc_zone}`].filter(Boolean).join(', ');

  const details = [
    `${issue} reported by a citizen on Civicly Chennai.`,
    row.note?.trim() ? `Details: ${row.note.trim()}` : null,
    road ? `Street: ${road}${area ? ` (${area})` : ''}` : null,
    row.landmark?.trim() ? `Landmark: ${row.landmark.trim()}` : null,
    opts.photoUrl ? `Photo: ${opts.photoUrl}` : null,
    `Live report: ${opts.siteUrl.replace(/\/$/, '')}/home?focus=${row.report_id}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    ComplainantName: row.reporter_name?.trim() || ANONYMOUS_NAME,
    ComplainantAddr: road,
    MobileNo: '',
    Email: '',
    ComplaintTitle: type.name,
    ComplaintType: type.id,
    ComplaintDetails: details,
    StreetId: row.gcc_street_id ?? '',
    Comp_Image: opts.imageDataUrl ?? '',
    latitude: row.lat.toFixed(6),
    longtitude: row.lng.toFixed(6),
    Landmark: row.landmark?.trim() || road,
    gender: row.gender,
  };
}
