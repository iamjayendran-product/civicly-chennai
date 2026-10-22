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
const signOut = vi.fn().mockResolvedValue({ error: null });
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/supabase/browser', () => ({ getBrowserClient: () => ({ auth: { signOut } }) }));

vi.mock('./GccReportCard', () => ({
  GccReportCard: ({ row, onSaved, onDeleted }: { row: QueueRow; onSaved: (r: QueueRow, i: { duplicateOf: string[] }) => void; onDeleted: (r: QueueRow) => void }) => (
    <div data-testid="card">
      {row.id}
      <button onClick={() => onDeleted(row)}>delete-{row.id}</button>
      <button onClick={() => onSaved({ ...row, complaint_id: '2026-736JEJ', gcc_status: 'registered' }, { duplicateOf: [] })}>
        save-{row.id}
      </button>
    </div>
  ),
}));

vi.mock('./GccTable', () => ({
  GccTable: ({ rows }: { rows: QueueRow[] }) => <table data-testid="table">{rows.length}</table>,
}));

import { GccQueue } from './GccQueue';

function setWide(wide: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: wide && query === '(min-width: 768px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function makeRow(i: number): QueueRow {
  const ts = new Date(Date.UTC(2026, 9, 20, 0, 0, 0) - i * 60000).toISOString();
  return {
    id: `r${i}`, category: 'pothole', subtype: null, note: null, lng: 80.27, lat: 13.06,
    created_at: ts, upvote_count: 0, reporter_name: null, reporter_phone: null, photo_paths: [],
    complaint_id: null, gcc_status: null, gcc_note: null, filed_at: null, filing_updated_at: null, sort_key: ts, reporter_gender: null, gcc_street_id: null, gcc_road_name: null, gcc_zone: null, gcc_ward: null, landmark: null,
  };
}

beforeEach(() => {
  setWide(false);
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

  it('drops a Load more response that arrives after switching tabs', async () => {
    const page = Array.from({ length: 20 }, (_, i) => makeRow(i));
    let resolveMore: (rows: QueueRow[]) => void = () => {};
    queue
      .mockResolvedValueOnce(page)
      .mockReturnValueOnce(new Promise<QueueRow[]>((r) => (resolveMore = r)))
      .mockResolvedValueOnce([{ ...makeRow(50), complaint_id: '2026-111AAA' }]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('button', { name: t('admin.loadMore') }));
    fireEvent.click(screen.getByRole('tab', { name: t('admin.tab.filed', { count: 2 }) }));
    expect(await screen.findByText('r50')).toBeInTheDocument();

    resolveMore([makeRow(20)]);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('r20')).not.toBeInTheDocument();
    expect(screen.queryByText('r0')).not.toBeInTheDocument();
  });

  it('ignores a second Load more tap while the first is in flight', async () => {
    const page = Array.from({ length: 20 }, (_, i) => makeRow(i));
    queue.mockResolvedValueOnce(page).mockResolvedValue([makeRow(20)]);
    render(<GccQueue />);
    const button = await screen.findByRole('button', { name: t('admin.loadMore') });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByText('r20')).toBeInTheDocument();
    expect(queue).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('r20')).toHaveLength(1);
  });

  it('moves a saved report out of unfiled and refreshes the counts', async () => {
    queue.mockResolvedValue([makeRow(1), makeRow(2)]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('button', { name: 'save-r1' }));
    await waitFor(() => expect(screen.queryByText('r1')).not.toBeInTheDocument());
    expect(screen.getByText(t('admin.form.saved', { id: '2026-736JEJ' }))).toBeInTheDocument();
    expect(counts).toHaveBeenCalledTimes(2);
  });

  it('shows a table instead of cards on wide screens', async () => {
    setWide(true);
    queue.mockResolvedValue([makeRow(1), makeRow(2)]);
    render(<GccQueue />);
    expect(await screen.findByTestId('table')).toHaveTextContent('2');
    expect(screen.queryAllByTestId('card')).toHaveLength(0);
  });

  it('keeps cards on phones', async () => {
    queue.mockResolvedValue([makeRow(1)]);
    render(<GccQueue />);
    expect(await screen.findByTestId('card')).toBeInTheDocument();
    expect(screen.queryByTestId('table')).not.toBeInTheDocument();
  });

  it('removes a deleted report and refreshes the counts', async () => {
    queue.mockResolvedValue([makeRow(1), makeRow(2)]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('button', { name: 'delete-r1' }));
    await waitFor(() => expect(screen.queryByText('r1')).not.toBeInTheDocument());
    expect(screen.getByText(t('admin.deleted'))).toBeInTheDocument();
    expect(counts).toHaveBeenCalledTimes(2);
  });

  it('signs out', async () => {
    queue.mockResolvedValue([]);
    render(<GccQueue />);
    fireEvent.click(await screen.findByRole('button', { name: t('admin.signOut') }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/login'));
    expect(signOut).toHaveBeenCalled();
  });

  it('says when there is nothing left to file', async () => {
    queue.mockResolvedValue([]);
    render(<GccQueue />);
    expect(await screen.findByText(t('admin.empty.unfiled'))).toBeInTheDocument();
  });
});
