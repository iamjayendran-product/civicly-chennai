import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({ rpc }),
}));

import { gccApi, GccApiError, GCC_STATUSES } from './gccApi';

beforeEach(() => {
  rpc.mockReset();
});

describe('GCC_STATUSES', () => {
  it('lists the eight GCC statuses in workflow order', () => {
    expect(GCC_STATUSES).toEqual([
      'registered', 'forwarded', 'processing', 'completed',
      'rejected', 'reopened', 'withdrawn', 'not_completed',
    ]);
  });
});

describe('gccApi.save', () => {
  it('sends the normalised ID and returns the duplicates', async () => {
    rpc.mockResolvedValue({ data: [{ duplicate_of: ['other-report'] }], error: null });

    const result = await gccApi.save({ reportId: 'r1', complaintId: ' 2026-736jej ', status: 'processing', note: 'ward 112' });

    expect(rpc).toHaveBeenCalledWith('admin_save_gcc_filing', {
      p_report_id: 'r1',
      p_complaint_id: '2026-736JEJ',
      p_status: 'processing',
      p_note: 'ward 112',
    });
    expect(result).toEqual({ duplicateOf: ['other-report'] });
  });

  it('throws a GccApiError carrying the RPC error code', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'AUTH_REQUIRED' } });

    const error = await gccApi.save({ reportId: 'r1', complaintId: '2026-736JEJ' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GccApiError);
    expect((error as GccApiError).code).toBe('AUTH_REQUIRED');
  });

  it('maps an unrecognised error to UNKNOWN', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } });

    const error = await gccApi.save({ reportId: 'r1', complaintId: '2026-736JEJ' }).catch((e: unknown) => e);

    expect((error as GccApiError).code).toBe('UNKNOWN');
  });
});

describe('gccApi.queue', () => {
  it('passes tab, status and keyset cursor through', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await gccApi.queue({ tab: 'filed', status: 'processing', before: '2026-10-20T05:00:00Z' });

    expect(rpc).toHaveBeenCalledWith('admin_gcc_queue', {
      p_tab: 'filed',
      p_status: 'processing',
      p_before: '2026-10-20T05:00:00Z',
    });
  });
});

describe('gccApi.whoami', () => {
  it('returns false instead of throwing when the call fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await expect(gccApi.whoami()).resolves.toBe(false);
  });
});

describe('gccApi.counts', () => {
  it('unwraps the single counts row', async () => {
    rpc.mockResolvedValue({ data: [{ unfiled: 3, filed: 2 }], error: null });
    await expect(gccApi.counts()).resolves.toEqual({ unfiled: 3, filed: 2 });
  });
});
