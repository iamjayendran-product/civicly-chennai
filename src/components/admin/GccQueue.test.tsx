import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import type { QueueRow } from '@/lib/admin/gccApi';

const queue = vi.fn();
const counts = vi.fn();
vi.mock('@/lib/admin/gccApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/gccApi')>()),
  gccApi: { queue: (...a: unknown[]) => queue(...a), counts: () => counts() },
}));

// The card is tested on its own; here it only needs to expose its row and onSaved.
vi.mock('./GccReportCard', () => ({
  GccReportCard: ({ row, onSaved }: { row: QueueRow; onSaved: (r: QueueRow, i: { duplicateOf: string[] }) => void }) => (
    <div data-testid="card">
      {row.id}
      <button onClick={() => onSaved({ ...row, complaint_id: '2026-736JEJ', gcc_status: 'registered' }, { duplicateOf: [] })}>
        save-{row.id}
      </button>
    </div>
  ),
}));

import { GccQueue } from './GccQueue';

function makeRow(i: number): QueueRow {
  const ts = new Date(Date.UTC(2026, 9, 20, 0, 0, 0) - i * 60000).toISOString();
  return {
    id: `r${i}`, category: 'pothole', subtype: null, note: null, lng: 80.27, lat: 13.06,
    created_at: ts, upvote_count: 0, reporter_name: null, reporter_phone: null, photo_paths: [],
    complaint_id: null, gcc_status: null, gcc_note: null, filed_at: null, filing_updated_at: null, sort_key: ts,
  };
}

beforeEach(() => {
  queue.mockReset();
  counts.mockReset();
  counts.mockResolvedValue({ unfiled: 3, filed: 2 });
});

describe('GccQueue', () => {
  it('loads the unfiled tab and shows counts on the tabs', async () => {
    queue.mockResolvedValue([makeRow(1)]);
    render(<GccQueue />);
    expect(await screen.findByRole('tab', { name: t('admin.tab.unfiled', { count: 3 }) })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: t('admin.tab.filed', { count: 2 }) })).toBeInTheDocument();
    expect(queue).toHaveBeenCalledWith({ tab: 'unfiled' });
  });

  it('switches to the filed tab and shows the status filters', async () => {
    queue.mockResolvedValue([]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('tab', { name: t('admin.tab.filed', { count: 2 }) }));
    await waitFor(() => expect(queue).toHaveBeenLastCalledWith({ tab: 'filed' }));
    expect(screen.getAllByRole('button', { pressed: false }).length + screen.getAllByRole('button', { pressed: true }).length).toBe(9);
  });

  it('narrows the filed tab by status', async () => {
    queue.mockResolvedValue([]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('tab', { name: t('admin.tab.filed', { count: 2 }) }));
    fireEvent.click(await screen.findByRole('button', { name: t('admin.gccStatus.processing') }));
    await waitFor(() => expect(queue).toHaveBeenLastCalledWith({ tab: 'filed', status: 'processing' }));
  });

  it('loads the next page from the last row', async () => {
    const page = Array.from({ length: 20 }, (_, i) => makeRow(i));
    queue.mockResolvedValueOnce(page).mockResolvedValueOnce([makeRow(20)]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('button', { name: t('admin.loadMore') }));
    await waitFor(() => expect(queue).toHaveBeenLastCalledWith({ tab: 'unfiled', before: page[19].sort_key }));
    expect(await screen.findByText('r20')).toBeInTheDocument();
  });

  it('moves a saved report out of unfiled and refreshes the counts', async () => {
    queue.mockResolvedValue([makeRow(1), makeRow(2)]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('button', { name: 'save-r1' }));
    await waitFor(() => expect(screen.queryByText('r1')).not.toBeInTheDocument());
    expect(screen.getByText(t('admin.form.saved', { id: '2026-736JEJ' }))).toBeInTheDocument();
    expect(counts).toHaveBeenCalledTimes(2);
  });

  it('says when there is nothing left to file', async () => {
    queue.mockResolvedValue([]);
    render(<GccQueue />);
    expect(await screen.findByText(t('admin.empty.unfiled'))).toBeInTheDocument();
  });
});
