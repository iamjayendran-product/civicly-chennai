import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { GccStreet, StreetsNearResult } from './streetLookup';

const fetchStreetsNear = vi.fn<(lng: number, lat: number) => Promise<StreetsNearResult>>();
vi.mock('./streetLookup', () => ({ fetchStreetsNear: (lng: number, lat: number) => fetchStreetsNear(lng, lat) }));

import { useGccStreets } from './useGccStreets';

const VADAPALANI = { lng: 80.204032, lat: 13.05202 };
const TAMBARAM = { lng: 80.118, lat: 12.9249 };

function street(roadId: string, roadName: string): GccStreet {
  return { roadId, roadName, zone: '10', ward: '129', region: 'Central', anchor: VADAPALANI, distanceM: 5 };
}

beforeEach(() => fetchStreetsNear.mockReset());

describe('useGccStreets', () => {
  it('is idle with no location', () => {
    const { result } = renderHook(() => useGccStreets(null));
    expect(result.current.status).toBe('idle');
    expect(result.current.selected).toBeNull();
    expect(fetchStreetsNear).not.toHaveBeenCalled();
  });

  it('does not look up streets for a pin outside GCC limits', async () => {
    const { result } = renderHook(() => useGccStreets(TAMBARAM));
    await waitFor(() => expect(result.current.status).toBe('outside'));
    expect(fetchStreetsNear).not.toHaveBeenCalled();
  });

  it('loads streets for the pin and pre-selects the nearest one, with it as the landmark', async () => {
    fetchStreetsNear.mockResolvedValue({ status: 'ok', streets: [street('7553', 'Arunachalam Street'), street('3438', 'S.S.R.Pangajam Street')] });
    const { result } = renderHook(() => useGccStreets(VADAPALANI));
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(fetchStreetsNear).toHaveBeenCalledWith(VADAPALANI.lng, VADAPALANI.lat);
    expect(result.current.streets).toHaveLength(2);
    expect(result.current.selected?.roadId).toBe('7553');
    expect(result.current.landmark).toBe('Arunachalam Street');
  });

  it('lets the reporter pick another street and edit the landmark', async () => {
    fetchStreetsNear.mockResolvedValue({ status: 'ok', streets: [street('7553', 'Arunachalam Street'), street('3438', 'S.S.R.Pangajam Street')] });
    const { result } = renderHook(() => useGccStreets(VADAPALANI));
    await waitFor(() => expect(result.current.status).toBe('ok'));

    act(() => result.current.selectStreet('3438'));
    expect(result.current.selected?.roadName).toBe('S.S.R.Pangajam Street');
    expect(result.current.landmark).toBe('S.S.R.Pangajam Street');

    act(() => result.current.setLandmark('Opposite Nexus Vijaya Mall'));
    expect(result.current.landmark).toBe('Opposite Nexus Vijaya Mall');
  });

  it('reports none when GCC has no street near the pin', async () => {
    fetchStreetsNear.mockResolvedValue({ status: 'none' });
    const { result } = renderHook(() => useGccStreets(VADAPALANI));
    await waitFor(() => expect(result.current.status).toBe('none'));
    expect(result.current.selected).toBeNull();
  });

  it('reports error and can retry', async () => {
    fetchStreetsNear.mockResolvedValueOnce({ status: 'error' });
    const { result } = renderHook(() => useGccStreets(VADAPALANI));
    await waitFor(() => expect(result.current.status).toBe('error'));

    fetchStreetsNear.mockResolvedValueOnce({ status: 'ok', streets: [street('7553', 'Arunachalam Street')] });
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(fetchStreetsNear).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale response when the pin moved meanwhile', async () => {
    let resolveFirst: (value: StreetsNearResult) => void = () => {};
    fetchStreetsNear
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ status: 'ok', streets: [street('2', 'Second Street')] });

    const { result, rerender } = renderHook(({ loc }) => useGccStreets(loc), { initialProps: { loc: VADAPALANI } });
    rerender({ loc: { lng: 80.2716, lat: 13.0819 } });
    await waitFor(() => expect(result.current.selected?.roadId).toBe('2'));

    await act(async () => resolveFirst({ status: 'ok', streets: [street('1', 'First Street')] }));
    expect(result.current.selected?.roadId).toBe('2');
  });
});
