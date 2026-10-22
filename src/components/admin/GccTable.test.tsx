import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import { formatAll, mapsUrl } from '@/lib/admin/formatForGcc';
import type { QueueRow } from '@/lib/admin/gccApi';

vi.mock('@/lib/supabase/browser', () => ({
  getBrowserClient: () => ({
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }) }) },
  }),
}));
const save = vi.fn();
const deleteReport = vi.fn();
vi.mock('@/lib/admin/gccApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/gccApi')>()),
  gccApi: { save: (...a: unknown[]) => save(...a), history: vi.fn(), deleteReport: (...a: unknown[]) => deleteReport(...a) },
}));

import { GccTable } from './GccTable';

const unfiled: QueueRow = {
  id: 'r1', category: 'pothole', subtype: null, note: 'Near bus stop', lng: 80.27, lat: 13.06,
  created_at: '2026-10-20T05:00:00Z', upvote_count: 14, reporter_name: null, reporter_phone: null,
  photo_paths: ['u1/a.jpg'], complaint_id: null, gcc_status: null, gcc_note: null, filed_at: null,
  filing_updated_at: null, sort_key: '2026-10-20T05:00:00Z', reporter_gender: null, gcc_street_id: null, gcc_road_name: null, gcc_zone: null, gcc_ward: null, landmark: null,
};
const filed: QueueRow = {
  ...unfiled, id: 'r2', reporter_name: 'Priya', reporter_phone: '9876543210',
  complaint_id: '2026-736JEJ', gcc_status: 'processing', gcc_note: null,
  filed_at: '2026-10-21T05:00:00Z', filing_updated_at: '2026-10-21T05:00:00Z',
};

const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  save.mockReset();
  deleteReport.mockReset();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

function rowFor(id: string) {
  return screen.getByTestId(`gcc-row-${id}`);
}

describe('GccTable', () => {
  it('has one column per kind of information', () => {
    render(<GccTable rows={[unfiled]} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      t('admin.table.report'), t('admin.table.location'), t('admin.table.reporter'), t('admin.table.gcc'), t('admin.table.actions'),
    ]);
  });

  it('shows the issue, +1 count, map link and dashes for missing contact in one row', () => {
    render(<GccTable rows={[unfiled]} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    const row = within(rowFor('r1'));
    expect(row.getByText('Pothole — Near bus stop')).toBeInTheDocument();
    expect(row.getByText(t('admin.card.upvotes', { count: 14 }))).toBeInTheDocument();
    expect(row.getByRole('link', { name: t('admin.table.map') })).toHaveAttribute('href', mapsUrl(13.06, 80.27));
    // Street, name, phone and gender are all missing on this row.
    expect(row.getAllByText(t('admin.card.noValue'))).toHaveLength(4);
  });

  it('files an unfiled report from its row', async () => {
    save.mockResolvedValue({ duplicateOf: [] });
    const onSaved = vi.fn();
    render(<GccTable rows={[unfiled]} onSaved={onSaved} onDeleted={vi.fn()} />);
    const row = within(rowFor('r1'));
    expect(row.getByRole('button', { name: t('admin.form.markFiled') })).toBeDisabled();
    fireEvent.change(row.getByLabelText(t('admin.form.complaintId')), { target: { value: '2026-736jej' } });
    fireEvent.click(row.getByRole('button', { name: t('admin.form.markFiled') }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({ reportId: 'r1', complaintId: '2026-736jej', status: 'registered' });
  });

  it('shows a filed report’s ID and status, and edits the status inline', async () => {
    save.mockResolvedValue({ duplicateOf: [] });
    render(<GccTable rows={[filed]} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    const row = within(rowFor('r2'));
    expect(row.getByText('2026-736JEJ')).toBeInTheDocument();
    expect(row.getByText(t('admin.gccStatus.processing'))).toBeInTheDocument();
    fireEvent.click(row.getByRole('button', { name: t('admin.form.edit') }));
    fireEvent.change(row.getByLabelText(t('admin.form.status')), { target: { value: 'completed' } });
    fireEvent.click(row.getByRole('button', { name: t('admin.form.save') }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ reportId: 'r2', complaintId: '2026-736JEJ', status: 'completed' }),
    );
  });

  it('shows what GCC’s form asks for: GCC type, street, ward/zone, landmark and gender', () => {
    const located: QueueRow = {
      ...filed, reporter_gender: 'female', gcc_street_id: '7553', gcc_road_name: 'Arunachalam Street',
      gcc_zone: '10', gcc_ward: '128', landmark: 'Near Kauvery Hospital',
    };
    render(<GccTable rows={[located]} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    const row = within(rowFor('r2'));
    expect(row.getByText('Road and Footpath › Pot hole fill up / Repairs to the damaged surface')).toBeInTheDocument();
    expect(row.getByText('Arunachalam Street (ID 7553)')).toBeInTheDocument();
    expect(row.getByText('Ward 128 · Zone 10')).toBeInTheDocument();
    expect(row.getByText('Near Kauvery Hospital')).toBeInTheDocument();
    expect(row.getByText('Female')).toBeInTheDocument();
  });

  it('deletes a report after confirmation', async () => {
    deleteReport.mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDeleted = vi.fn();
    render(<GccTable rows={[unfiled]} onSaved={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.click(within(rowFor('r1')).getByRole('button', { name: t('admin.delete') }));
    expect(confirm).toHaveBeenCalledWith(t('admin.deleteConfirm'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(unfiled));
    expect(deleteReport).toHaveBeenCalledWith('r1');
    confirm.mockRestore();
  });

  it('does nothing when the delete is not confirmed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GccTable rows={[unfiled]} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(within(rowFor('r1')).getByRole('button', { name: t('admin.delete') }));
    expect(deleteReport).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('copies everything for GCC from the row', () => {
    render(<GccTable rows={[unfiled]} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    fireEvent.click(within(rowFor('r1')).getByRole('button', { name: t('admin.copy.all') }));
    expect(writeText).toHaveBeenCalledWith(formatAll(unfiled, mapsUrl(13.06, 80.27)));
  });

  it('expands a details row with photos, single-field copies and the note', () => {
    render(<GccTable rows={[unfiled]} onSaved={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.queryByLabelText(t('admin.form.note'))).not.toBeInTheDocument();
    fireEvent.click(within(rowFor('r1')).getByRole('button', { name: t('admin.table.more') }));
    expect(screen.getByLabelText(t('admin.form.note'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.copy.coords') })).toBeInTheDocument();
    expect(screen.getAllByAltText(t('admin.card.photoAlt', { n: 1 })).length).toBeGreaterThan(0);
  });
});
