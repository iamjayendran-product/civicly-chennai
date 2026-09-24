import { describe, it, expect } from 'vitest';
import { validateReportDraft, validateReporterContact, type ReportDraft } from './validation';

const validDraft: ReportDraft = {
  category: 'pothole',
  subtype: null,
  note: '',
  photoCount: 1,
  hasLocation: true,
};

describe('validateReportDraft', () => {
  it('returns no errors for a valid pothole draft', () => {
    expect(validateReportDraft(validDraft)).toEqual([]);
  });

  it('requires a subtype when category is other', () => {
    expect(validateReportDraft({ ...validDraft, category: 'other', subtype: null })).toContain('SUBTYPE_REQUIRED');
  });

  it('rejects a note over 280 characters', () => {
    expect(validateReportDraft({ ...validDraft, note: 'x'.repeat(281) })).toContain('NOTE_TOO_LONG');
  });

  it('requires at least one photo', () => {
    expect(validateReportDraft({ ...validDraft, photoCount: 0 })).toContain('PHOTOS_REQUIRED');
  });

  it('rejects more than three photos', () => {
    expect(validateReportDraft({ ...validDraft, photoCount: 4 })).toContain('TOO_MANY_PHOTOS');
  });

  it('requires a location', () => {
    expect(validateReportDraft({ ...validDraft, hasLocation: false })).toContain('LOCATION_REQUIRED');
  });

  it('accepts a note at exactly 280 characters', () => {
    expect(validateReportDraft({ ...validDraft, note: 'x'.repeat(280) })).not.toContain('NOTE_TOO_LONG');
  });

  it('accepts exactly three photos', () => {
    expect(validateReportDraft({ ...validDraft, photoCount: 3 })).not.toContain('TOO_MANY_PHOTOS');
  });

  it('rejects subtype when category is not other', () => {
    expect(validateReportDraft({ ...validDraft, category: 'pothole', subtype: 'debris' })).toContain('SUBTYPE_NOT_ALLOWED');
  });

  it('accepts category other with a valid subtype', () => {
    expect(validateReportDraft({ ...validDraft, category: 'other', subtype: 'debris' })).toEqual([]);
  });
});

describe('validateReporterContact', () => {
  it('returns no errors for a valid name and phone', () => {
    expect(validateReporterContact({ name: 'Jane Reporter', phone: '9876543210' })).toEqual([]);
  });

  it('requires a non-empty name', () => {
    expect(validateReporterContact({ name: '', phone: '9876543210' })).toContain('NAME_REQUIRED');
  });

  it('requires a non-blank name', () => {
    expect(validateReporterContact({ name: '   ', phone: '9876543210' })).toContain('NAME_REQUIRED');
  });

  it('rejects a phone number that is too short', () => {
    expect(validateReporterContact({ name: 'Jane', phone: '98765' })).toContain('PHONE_INVALID');
  });

  it('rejects a phone number starting with an invalid digit', () => {
    expect(validateReporterContact({ name: 'Jane', phone: '1234567890' })).toContain('PHONE_INVALID');
  });

  it('accepts a phone number with spaces or a country code, ignoring formatting', () => {
    expect(validateReporterContact({ name: 'Jane', phone: '+91 98765 43210' })).toEqual([]);
  });
});
