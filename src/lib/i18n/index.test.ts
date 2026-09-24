import { describe, it, expect } from 'vitest';
import { t, errorCodeToMessage } from './index';

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
    const codes = ['OUTSIDE_CMDA', 'RATE_LIMITED', 'INVALID_PHOTOS', 'INVALID_INPUT', 'AUTH_REQUIRED'];
    const messages = codes.map(errorCodeToMessage);
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(errorCodeToMessage('SOMETHING_NEW')).toBe(t('errors.UNKNOWN'));
  });
});
