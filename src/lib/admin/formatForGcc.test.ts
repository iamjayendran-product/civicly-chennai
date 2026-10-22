import { describe, it, expect } from 'vitest';
import { formatDescription, formatAll, formatCoords, formatGccType, mapsUrl } from './formatForGcc';
import type { QueueRow } from './gccApi';

function row(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 'r1',
    category: 'pothole',
    subtype: null,
    note: 'Near bus stop',
    lng: 80.27,
    lat: 13.06,
    created_at: '2026-10-20T05:00:00Z',
    upvote_count: 0,
    reporter_name: 'Priya',
    reporter_phone: '9876543210',
    photo_paths: [],
    complaint_id: null,
    gcc_status: null,
    gcc_note: null,
    filed_at: null,
    filing_updated_at: null,
    sort_key: '2026-10-20T05:00:00Z',
    reporter_gender: 'female',
    gcc_street_id: '7553',
    gcc_road_name: 'Arunachalam Street',
    gcc_zone: '10',
    gcc_ward: '128',
    landmark: 'Near Kauvery Hospital',
    ...overrides,
  };
}

describe('mapsUrl', () => {
  it('builds a Google Maps query link from lat and lng', () => {
    expect(mapsUrl(13.06, 80.27)).toBe('https://maps.google.com/?q=13.06,80.27');
  });
});

describe('formatCoords', () => {
  it('rounds to 6 decimal places and drops trailing zeros', () => {
    expect(formatCoords(13.0553000496103, 80.0538238281658)).toBe('13.0553, 80.053824');
  });
});

describe('formatDescription', () => {
  it('joins the category label and the note', () => {
    expect(formatDescription(row())).toBe('Pothole — Near bus stop');
  });

  it('uses the subtype label for "Other" and omits a missing note', () => {
    expect(formatDescription(row({ category: 'other', subtype: 'open_manhole', note: null }))).toBe('Open manhole');
  });
});

describe('formatAll', () => {
  it('labels every field GCC’s complaint form asks for, one per line', () => {
    const r = row();
    expect(formatAll(r, mapsUrl(r.lat, r.lng))).toBe([
      'Pothole — Near bus stop',
      'GCC type: Road and Footpath › Pot hole fill up / Repairs to the damaged surface',
      'Street: Arunachalam Street (ID 7553)',
      'Ward 128 · Zone 10',
      'Landmark: Near Kauvery Hospital',
      'Location: 13.06, 80.27 — https://maps.google.com/?q=13.06,80.27',
      'Name: Priya',
      'Phone: 9876543210',
      'Gender: Female',
    ].join('\n'));
  });

  it('uses rounded coordinates', () => {
    const r = row({ lat: 13.0553000496103, lng: 80.0538238281658 });
    expect(formatAll(r, 'x')).toContain('Location: 13.0553, 80.053824 — x');
  });

  it('shows a dash for anything missing', () => {
    const r = row({
      reporter_name: null, reporter_phone: null, reporter_gender: null,
      gcc_street_id: null, gcc_road_name: null, gcc_zone: null, gcc_ward: null, landmark: null,
    });
    const lines = formatAll(r, mapsUrl(r.lat, r.lng)).split('\n');
    expect(lines).toContain('Street: —');
    expect(lines).toContain('Ward — · Zone —');
    expect(lines).toContain('Landmark: —');
    expect(lines.slice(-3)).toEqual(['Name: —', 'Phone: —', 'Gender: —']);
  });
});

describe('formatGccType', () => {
  it('maps a Civicly category to GCC’s complaint group and type', () => {
    expect(formatGccType(row({ category: 'waterlogging' }))).toBe('Water Stagnation › Stagnation of Water');
  });
});
