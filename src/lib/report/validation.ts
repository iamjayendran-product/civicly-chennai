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
  /** The pin is inside Greater Chennai Corporation limits (client pre-check of OUTSIDE_GCC). */
  inServiceArea: boolean;
  /** A GCC street (road_id) is chosen for the pin — GCC complaints require one. */
  hasStreet: boolean;
}

export type ReportDraftError =
  | 'SUBTYPE_REQUIRED'
  | 'SUBTYPE_NOT_ALLOWED'
  | 'NOTE_TOO_LONG'
  | 'PHOTOS_REQUIRED'
  | 'TOO_MANY_PHOTOS'
  | 'LOCATION_REQUIRED'
  | 'OUTSIDE_GCC'
  | 'STREET_REQUIRED';

const MAX_NOTE_LENGTH = 280;
const MAX_PHOTOS = 3;

export function validateReportDraft(draft: ReportDraft): ReportDraftError[] {
  const errors: ReportDraftError[] = [];

  if (draft.category === 'other' && draft.subtype === null) {
    errors.push('SUBTYPE_REQUIRED');
  } else if (draft.category !== 'other' && draft.subtype !== null) {
    errors.push('SUBTYPE_NOT_ALLOWED');
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
  } else if (!draft.inServiceArea) {
    errors.push('OUTSIDE_GCC');
  } else if (!draft.hasStreet) {
    errors.push('STREET_REQUIRED');
  }

  return errors;
}

/** GCC's complaint form requires one of these. */
export type ReporterGender = 'male' | 'female' | 'transgender';

export interface ReporterContact {
  name: string;
  phone: string;
  gender: ReporterGender | null;
}

export type ReporterContactError = 'NAME_REQUIRED' | 'PHONE_INVALID' | 'GENDER_REQUIRED';

// Indian mobile numbers: 10 digits, first digit 6-9. Formatting (spaces, a +91 country
// code, dashes) is stripped before checking, since users type phone numbers every way.
const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

export function validateReporterContact(contact: ReporterContact): ReporterContactError[] {
  const errors: ReporterContactError[] = [];

  if (contact.name.trim().length === 0) {
    errors.push('NAME_REQUIRED');
  }

  const digitsOnly = contact.phone.replace(/[^\d]/g, '').replace(/^91(?=\d{10}$)/, '');
  if (!INDIAN_MOBILE_PATTERN.test(digitsOnly)) {
    errors.push('PHONE_INVALID');
  }

  if (contact.gender === null) {
    errors.push('GENDER_REQUIRED');
  }

  return errors;
}
