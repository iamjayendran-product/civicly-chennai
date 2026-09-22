import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

type ChangeHandler = (payload: { new: Record<string, unknown> }) => void;

let insertHandler: ChangeHandler = () => {};
let updateHandler: ChangeHandler = () => {};

const rpc = vi.fn();
const channel = {
  on: vi.fn(function (this: unknown, _event: string, filter: { event: string }, handler: ChangeHandler) {
    if (filter.event === 'INSERT') insertHandler = handler;
    if (filter.event === 'UPDATE') updateHandler = handler;
    return this;
  }),
  subscribe: vi.fn(function (this: unknown) {
    return this;
  }),
};
const removeChannel = vi.fn();

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    rpc,
    channel: () => channel,
    removeChannel,
  }),
}));

import { useReports } from './useReports';

const bbox = { minLng: 80.2, minLat: 13.0, maxLng: 80.3, maxLat: 13.1 };

describe('useReports', () => {
  beforeEach(() => {
    rpc.mockReset();
    channel.on.mockClear();
    channel.subscribe.mockClear();
  });

  it('loads the initial bbox snapshot from reports_in_bbox', async () => {
    rpc.mockResolvedValue({
      data: [
        { id: 'r1', category: 'pothole', subtype: null, note: null, lng: 80.25, lat: 13.05, status: 'open', upvote_count: 0, created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    });

    const { result } = renderHook(() => useReports(bbox, false));

    await waitFor(() => expect(result.current.status).toBe('live'));
    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0].id).toBe('r1');
    expect(rpc).toHaveBeenCalledWith('reports_in_bbox', {
      p_min_lng: 80.2,
      p_min_lat: 13.0,
      p_max_lng: 80.3,
      p_max_lat: 13.1,
      p_include_fixed: false,
    });
  });

  it('adds a pin from a realtime INSERT event', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useReports(bbox, false));
    await waitFor(() => expect(result.current.status).toBe('live'));

    act(() => {
      insertHandler({
        new: { id: 'r2', category: 'pothole', subtype: null, note: null, lng: 80.26, lat: 13.06, status: 'open', is_hidden: false, upvote_count: 0, created_at: '2026-01-01T00:00:00Z' },
      });
    });

    expect(result.current.reports.map((r) => r.id)).toContain('r2');
  });

  it('removes a pin when a realtime UPDATE marks it hidden', async () => {
    rpc.mockResolvedValue({
      data: [{ id: 'r3', category: 'pothole', subtype: null, note: null, lng: 80.26, lat: 13.06, status: 'open', upvote_count: 0, created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });
    const { result } = renderHook(() => useReports(bbox, false));
    await waitFor(() => expect(result.current.reports).toHaveLength(1));

    act(() => {
      updateHandler({
        new: { id: 'r3', category: 'pothole', subtype: null, note: null, lng: 80.26, lat: 13.06, status: 'open', is_hidden: true, upvote_count: 0, created_at: '2026-01-01T00:00:00Z' },
      });
    });

    expect(result.current.reports).toHaveLength(0);
  });
});
