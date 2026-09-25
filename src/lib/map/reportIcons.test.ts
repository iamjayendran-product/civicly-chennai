import { describe, it, expect } from 'vitest';
import { reportIconId } from './reportIcons';

describe('reportIconId', () => {
  it('produces a distinct id per category/status combination', () => {
    const ids = new Set([
      reportIconId('pothole', 'open'),
      reportIconId('pothole', 'fixed'),
      reportIconId('waterlogging', 'open'),
      reportIconId('waterlogging', 'fixed'),
      reportIconId('other', 'open'),
      reportIconId('other', 'fixed'),
    ]);
    expect(ids.size).toBe(6);
  });

  it('is stable for the same inputs', () => {
    expect(reportIconId('pothole', 'open')).toBe(reportIconId('pothole', 'open'));
  });
});
