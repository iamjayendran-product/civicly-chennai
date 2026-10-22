import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import { formatAll, mapsUrl } from '@/lib/admin/formatForGcc';
import type { QueueRow } from '@/lib/admin/gccApi';

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }) },
  }),
}));
const deleteReport = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/admin/gccApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/gccApi')>()),
  gccApi: { save: vi.fn(), history: vi.fn(), deleteReport: (...a: unknown[]) => deleteReport(...a) },
}));

import { GccReportCard } from './GccReportCard';

const row: QueueRow = {
  id: 'r1', category: 'pothole', subtype: null, note: 'Near bus stop', lng: 80.27, lat: 13.06,
  created_at: '2026-10-20T05:00:00Z', upvote_count: 14, reporter_name: null, reporter_phone: null,
  photo_paths: ['u1/a.jpg'], complaint_id: null, gcc_status: null, gcc_note: null, filed_at: null,
  filing_updated_at: null, sort_key: '2026-10-20T05:00:00Z', reporter_gender: null, gcc_street_id: null, gcc_road_name: null, gcc_zone: null, gcc_ward: null, landmark: null,
};

const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('GccReportCard', () => {
  it('shows a dash for a missing reporter name and phone', () => {
    render(<GccReportCard row={row} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getAllByText(t('admin.card.noValue'))).toHaveLength(2);
  });

  it('shows how many people reported the issue', () => {
    render(<GccReportCard row={row} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByText(t('admin.card.upvotes', { count: 14 }))).toBeInTheDocument();
  });

  it('links to the location on Google Maps', () => {
    render(<GccReportCard row={row} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByRole('link', { name: t('admin.card.openMaps') })).toHaveAttribute('href', 'https://maps.google.com/?q=13.06,80.27');
  });

  it('shows report photos from the public bucket', () => {
    render(<GccReportCard row={row} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByAltText(t('admin.card.photoAlt', { n: 1 }))).toHaveAttribute('src', 'https://cdn.test/u1/a.jpg');
  });

  it('offers Delete on phones too', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleted = vi.fn();
    render(<GccReportCard row={row} onSaved={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: t('admin.delete') }));
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(row));
    confirm.mockRestore();
  });

  it('copies everything GCC needs in one go', () => {
    render(<GccReportCard row={row} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('admin.copy.all') }));
    expect(writeText).toHaveBeenCalledWith(formatAll(row, mapsUrl(13.06, 80.27)));
  });
});
