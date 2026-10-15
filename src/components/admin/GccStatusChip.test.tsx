import { describe, it, expect } from 'vitest';
import { gccChipLabel } from './GccStatusChip';

const now = new Date('2026-10-15T10:00:00Z');

describe('gccChipLabel', () => {
  it('counts down to the send while held', () => {
    expect(gccChipLabel({ status: 'pending', nextAttemptAt: '2026-10-15T11:58:00Z', complaintNumber: null, blockedReason: null }, now)).toBe('⏳ 1h 58m');
    expect(gccChipLabel({ status: 'pending', nextAttemptAt: '2026-10-15T10:07:30Z', complaintNumber: null, blockedReason: null }, now)).toBe('⏳ 7m');
  });

  it('says sending once the hold is over', () => {
    expect(gccChipLabel({ status: 'pending', nextAttemptAt: '2026-10-15T09:59:00Z', complaintNumber: null, blockedReason: null }, now)).toBe('⏳ sending');
    expect(gccChipLabel({ status: 'in_flight', nextAttemptAt: null, complaintNumber: null, blockedReason: null }, now)).toBe('⏳ sending');
  });

  it('shows the GCC complaint number once filed', () => {
    expect(gccChipLabel({ status: 'submitted', nextAttemptAt: null, complaintNumber: '48213', blockedReason: null }, now)).toBe('✅ #48213');
  });

  it('shows the flag reason, or just flagged', () => {
    expect(gccChipLabel({ status: 'blocked', nextAttemptAt: null, complaintNumber: null, blockedReason: 'spam' }, now)).toBe('🚫 Spam');
    expect(gccChipLabel({ status: 'blocked', nextAttemptAt: null, complaintNumber: null, blockedReason: null }, now)).toBe('🚫 flagged');
  });

  it('marks failures and reports never queued', () => {
    expect(gccChipLabel({ status: 'failed', nextAttemptAt: null, complaintNumber: null, blockedReason: null }, now)).toBe('⚠️ failed');
    expect(gccChipLabel({ status: null, nextAttemptAt: null, complaintNumber: null, blockedReason: null }, now)).toBe('—');
  });
});
