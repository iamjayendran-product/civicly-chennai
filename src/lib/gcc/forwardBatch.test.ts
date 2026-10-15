import { describe, it, expect, vi } from 'vitest';
import type { ClaimedSubmission } from './buildPayload';
import { forwardBatch, type ForwardDeps } from './forwardBatch';

function row(id: string, photo: string | null = `u/${id}.jpg`): ClaimedSubmission {
  return {
    report_id: id,
    category: 'pothole',
    subtype: null,
    note: null,
    lng: 80.2,
    lat: 13.05,
    gcc_street_id: '7553',
    gcc_road_name: 'Arunachalam Street',
    gcc_zone: '10',
    gcc_ward: '129',
    landmark: null,
    reporter_name: null,
    gender: 'male',
    photo_path: photo,
  };
}

function deps(overrides: Partial<ForwardDeps> = {}): ForwardDeps {
  return {
    claim: vi.fn(async () => [row('a'), row('b')]),
    loadPhoto: vi.fn(async () => 'data:image/jpeg;base64,AAAA'),
    publicPhotoUrl: (path: string) => `https://storage.example/${path}`,
    send: vi.fn(async () => ({ ok: true as const, complaintNumber: 'N1' })),
    record: vi.fn(async () => {}),
    pause: vi.fn(async () => {}),
    siteUrl: 'https://civicly.example',
    ...overrides,
  };
}

describe('forwardBatch', () => {
  it('files each claimed report with GCC and records its complaint number', async () => {
    const d = deps();
    const summary = await forwardBatch(d, 5);
    expect(d.claim).toHaveBeenCalledWith(5);
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.record).toHaveBeenCalledWith('a', 'N1', null);
    expect(d.record).toHaveBeenCalledWith('b', 'N1', null);
    expect(summary).toEqual({ claimed: 2, submitted: 2, failed: 0 });
  });

  it('sends the photo as a data URL and links it in the details', async () => {
    const d = deps({ claim: vi.fn(async () => [row('a')]) });
    await forwardBatch(d, 5);
    const fields = (d.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, string>;
    expect(fields.Comp_Image).toBe('data:image/jpeg;base64,AAAA');
    expect(fields.ComplaintDetails).toContain('https://storage.example/u/a.jpg');
  });

  it('pauses between submissions so GCC is not hit in a burst', async () => {
    const d = deps();
    await forwardBatch(d, 5);
    expect(d.pause).toHaveBeenCalledTimes(1);
  });

  it('retries once without the image when GCC rejects the submission with one', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'GCC responded HTTP 413' })
      .mockResolvedValueOnce({ ok: true, complaintNumber: 'N2' });
    const d = deps({ claim: vi.fn(async () => [row('a')]), send });
    await forwardBatch(d, 5);
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[1][0] as Record<string, string>).Comp_Image).toBe('');
    expect(d.record).toHaveBeenCalledWith('a', 'N2', null);
  });

  it('records the error when GCC rejects the submission', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'GCC responded HTTP 502' }));
    const d = deps({ claim: vi.fn(async () => [row('a', null)]), send });
    const summary = await forwardBatch(d, 5);
    expect(send).toHaveBeenCalledTimes(1);
    expect(d.record).toHaveBeenCalledWith('a', null, 'GCC responded HTTP 502');
    expect(summary).toEqual({ claimed: 1, submitted: 0, failed: 1 });
  });

  it('still files the report when its photo cannot be loaded', async () => {
    const d = deps({ claim: vi.fn(async () => [row('a')]), loadPhoto: vi.fn(async () => { throw new Error('storage down'); }) });
    await forwardBatch(d, 5);
    expect(((d.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, string>).Comp_Image).toBe('');
    expect(d.record).toHaveBeenCalledWith('a', 'N1', null);
  });

  it('records an unexpected error for one report and carries on with the next', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ok: true, complaintNumber: 'N3' });
    const d = deps({ send, loadPhoto: vi.fn(async () => null) });
    const summary = await forwardBatch(d, 5);
    expect(d.record).toHaveBeenCalledWith('a', null, 'boom');
    expect(d.record).toHaveBeenCalledWith('b', 'N3', null);
    expect(summary).toEqual({ claimed: 2, submitted: 1, failed: 1 });
  });
});
