import { describe, it, expect } from 'vitest';
import { formatDescription, formatAll, formatCoords, mapsUrl } from './formatForGcc';
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
  it('puts description, coordinates, maps link, name and phone on separate lines', () => {
    const r = row();
    expect(formatAll(r, mapsUrl(r.lat, r.lng))).toBe(
      ['Pothole — Near bus stop', '13.06, 80.27', 'https://maps.google.com/?q=13.06,80.27', 'Priya', '9876543210'].join('\n'),
    );
  });

  it('uses rounded coordinates', () => {
    const r = row({ lat: 13.0553000496103, lng: 80.0538238281658 });
    expect(formatAll(r, 'x').split('\n')[1]).toBe('13.0553, 80.053824');
  });

  it('shows a dash for a missing name or phone', () => {
    const r = row({ reporter_name: null, reporter_phone: null });
    expect(formatAll(r, mapsUrl(r.lat, r.lng)).split('\n').slice(3)).toEqual(['—', '—']);
  });
});
