export type ReportCategory = 'pothole' | 'waterlogging' | 'other';
export type ReportSubtype =
  | 'open_manhole'
  | 'debris'
  | 'damaged_footpath'
  | 'dug_up_road'
  | 'speed_breaker'
  | 'signage'
  | 'other';

export interface ReportDraft {
  category: ReportCategory;
  subtype: ReportSubtype | null;
  note: string;
  photoCount: number;
  hasLocation: boolean;
}

export type ReportDraftError =
  | 'SUBTYPE_REQUIRED'
  | 'NOTE_TOO_LONG'
  | 'PHOTOS_REQUIRED'
  | 'TOO_MANY_PHOTOS'
  | 'LOCATION_REQUIRED';

const MAX_NOTE_LENGTH = 280;
const MAX_PHOTOS = 3;

export function validateReportDraft(draft: ReportDraft): ReportDraftError[] {
  const errors: ReportDraftError[] = [];

  if (draft.category === 'other' && draft.subtype === null) {
    errors.push('SUBTYPE_REQUIRED');
  }
  if (draft.note.length > MAX_NOTE_LENGTH) {
    errors.push('NOTE_TOO_LONG');
  }
  if (draft.photoCount < 1) {
    errors.push('PHOTOS_REQUIRED');
  } else if (draft.photoCount > MAX_PHOTOS) {
    errors.push('TOO_MANY_PHOTOS');
  }
  if (!draft.hasLocation) {
    errors.push('LOCATION_REQUIRED');
  }

  return errors;
}
