import { describe, it, expect } from 'vitest';
import { t, errorCodeToMessage } from './index';
import en from './messages/en.json';

describe('t', () => {
  it('returns the English string for a known key', () => {
    expect(t('report.submit')).toBe('Submit grievance');
  });

  it('interpolates variables', () => {
    expect(t('map.pin.reportedAgo', { time: '2 hours' })).toBe('Reported 2 hours ago');
  });
});

describe('errorCodeToMessage', () => {
  it('maps every known RPC error code to a distinct message', () => {
    const codes = ['OUTSIDE_GCC', 'RATE_LIMITED', 'INVALID_PHOTOS', 'INVALID_INPUT', 'AUTH_REQUIRED'];
    const messages = codes.map(errorCodeToMessage);
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('explains OUTSIDE_GCC as outside the covered area', () => {
    expect(errorCodeToMessage('OUTSIDE_GCC')).toMatch(/outside the area Civicly covers/);
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(errorCodeToMessage('SOMETHING_NEW')).toBe(t('errors.UNKNOWN'));
  });
});

describe('citizen-facing copy', () => {
  it('never mentions GCC or the Corporation (product decision 2026-10-15; admin screen excepted)', () => {
    const offending = Object.entries(en).filter(
      ([key, value]) => !key.startsWith('admin.') && /\bGCC\b|Corporation/i.test(value)
    );
    expect(offending).toEqual([]);
  });
});
