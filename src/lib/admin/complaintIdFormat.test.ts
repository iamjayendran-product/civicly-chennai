import { describe, it, expect } from 'vitest';
import { normaliseComplaintId, looksLikeGccComplaintId } from './complaintIdFormat';

describe('normaliseComplaintId', () => {
  it('trims and uppercases a pasted ID', () => {
    expect(normaliseComplaintId(' 2026-736jej ')).toBe('2026-736JEJ');
  });
});

describe('looksLikeGccComplaintId', () => {
  it('accepts the YYYY-NNNXXX format GCC issues', () => {
    expect(looksLikeGccComplaintId('2026-736JEJ')).toBe(true);
  });

  it('rejects an ID missing the hyphen', () => {
    expect(looksLikeGccComplaintId('2026736JEJ')).toBe(false);
  });

  it('rejects something short and unrelated', () => {
    expect(looksLikeGccComplaintId('ABC')).toBe(false);
  });
});
