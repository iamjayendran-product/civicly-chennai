import { describe, it, expect } from 'vitest';
import type { ReportCategory, ReportSubtype } from '@/lib/report/validation';
import { gccComplaintTypeFor } from './categoryMap';

const SUBTYPES: ReportSubtype[] = ['open_manhole', 'debris', 'damaged_footpath', 'dug_up_road', 'speed_breaker', 'signage', 'other'];

describe('gccComplaintTypeFor', () => {
  it('files potholes under Road and Footpath → Pot hole fill up (112)', () => {
    expect(gccComplaintTypeFor('pothole', null)).toEqual({
      groupId: '18',
      groupName: 'Road and Footpath',
      id: '112',
      name: 'Pot hole fill up / Repairs to the damaged surface',
    });
  });

  it('files waterlogging under Water Stagnation → Stagnation of Water (138)', () => {
    expect(gccComplaintTypeFor('waterlogging', null)).toEqual({
      groupId: '20',
      groupName: 'Water Stagnation',
      id: '138',
      name: 'Stagnation of Water',
    });
  });

  it.each([
    ['open_manhole', '143'],
    ['damaged_footpath', '115'],
    ['dug_up_road', '113'],
    ['debris', '99'],
    ['speed_breaker', '112'],
    ['signage', '112'],
    ['other', '112'],
  ] as const)('maps other/%s to GCC sub-type %s', (subtype, id) => {
    expect(gccComplaintTypeFor('other', subtype).id).toBe(id);
  });

  it('maps every category/subtype combination the app can submit', () => {
    const combos: [ReportCategory, ReportSubtype | null][] = [
      ['pothole', null],
      ['waterlogging', null],
      ...SUBTYPES.map((s) => ['other', s] as [ReportCategory, ReportSubtype]),
    ];
    for (const [category, subtype] of combos) {
      const type = gccComplaintTypeFor(category, subtype);
      expect(type.id).toMatch(/^\d+$/);
      expect(type.name.length).toBeGreaterThan(0);
    }
  });
});
