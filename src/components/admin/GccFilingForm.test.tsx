import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import type { QueueRow } from '@/lib/admin/gccApi';

const save = vi.fn();
const history = vi.fn();
vi.mock('@/lib/admin/gccApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/gccApi')>()),
  gccApi: { save: (...a: unknown[]) => save(...a), history: (...a: unknown[]) => history(...a) },
}));

import { GccApiError } from '@/lib/admin/gccApi';
import { GccFilingForm } from './GccFilingForm';

const unfiled: QueueRow = {
  id: 'r1', category: 'pothole', subtype: null, note: null, lng: 80.27, lat: 13.06,
  created_at: '2026-10-20T05:00:00Z', upvote_count: 0, reporter_name: null, reporter_phone: null,
  photo_paths: [], complaint_id: null, gcc_status: null, gcc_note: null, filed_at: null,
  filing_updated_at: null, sort_key: '2026-10-20T05:00:00Z',
};
const filed: QueueRow = {
  ...unfiled,
  complaint_id: '2026-736JEJ', gcc_status: 'registered', gcc_note: 'ward 112',
  filed_at: '2026-10-21T05:00:00Z', filing_updated_at: '2026-10-21T05:00:00Z',
};

beforeEach(() => {
  save.mockReset();
  history.mockReset();
});

describe('GccFilingForm — unfiled report', () => {
  it('disables "Mark as filed" until an ID is entered', () => {
    render(<GccFilingForm row={unfiled} onSaved={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('admin.form.markFiled') })).toBeDisabled();
  });

  it('warns about an unusual ID format without blocking save', () => {
    render(<GccFilingForm row={unfiled} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(t('admin.form.complaintId')), { target: { value: 'abc' } });
    expect(screen.getByText(t('admin.form.formatWarning'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('admin.form.markFiled') })).toBeEnabled();
  });

  it('saves as Registered and reports the filed row', async () => {
    save.mockResolvedValue({ duplicateOf: [] });
    const onSaved = vi.fn();
    render(<GccFilingForm row={unfiled} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(t('admin.form.complaintId')), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.form.markFiled') }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({ reportId: 'r1', complaintId: 'abc', status: 'registered' });
    const [savedRow, info] = onSaved.mock.calls[0];
    expect(savedRow).toMatchObject({ id: 'r1', complaint_id: 'ABC', gcc_status: 'registered' });
    expect(info).toEqual({ duplicateOf: [] });
  });

  it('shows the INVALID_INPUT message when the server rejects the input', async () => {
    save.mockRejectedValue(new GccApiError('INVALID_INPUT'));
    render(<GccFilingForm row={unfiled} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(t('admin.form.complaintId')), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.form.markFiled') }));
    expect(await screen.findByText(t('admin.errors.INVALID_INPUT'))).toBeInTheDocument();
  });
});

describe('GccFilingForm — filed report', () => {
  it('shows the complaint ID and filed date', () => {
    render(<GccFilingForm row={filed} onSaved={vi.fn()} />);
    expect(screen.getByText('2026-736JEJ')).toBeInTheDocument();
    expect(screen.getByText(t('admin.form.filedOn', { date: '21 Oct' }), { exact: false })).toBeInTheDocument();
  });

  it('offers all eight GCC statuses when editing', () => {
    render(<GccFilingForm row={filed} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('admin.form.edit') }));
    const select = screen.getByLabelText(t('admin.form.status'));
    expect(select.querySelectorAll('option')).toHaveLength(8);
  });

  it('lists the history entries', async () => {
    history.mockResolvedValue([
      { complaint_id: '2026-736JEJ', status: 'registered', note: null, created_at: '2026-10-21T05:00:00Z' },
      { complaint_id: '2026-736JEJ', status: 'processing', note: 'ward 112', created_at: '2026-10-22T05:00:00Z' },
    ]);
    render(<GccFilingForm row={filed} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('admin.form.history') }));
    expect(history).toHaveBeenCalledWith('r1');
    expect(await screen.findByText(t('admin.gccStatus.processing'), { exact: false })).toBeInTheDocument();
  });

  it('mentions other reports that share the GCC number after saving', async () => {
    save.mockResolvedValue({ duplicateOf: ['r9'] });
    render(<GccFilingForm row={filed} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: t('admin.form.edit') }));
    fireEvent.change(screen.getByLabelText(t('admin.form.status')), { target: { value: 'processing' } });
    fireEvent.click(screen.getByRole('button', { name: t('admin.form.save') }));
    expect(await screen.findByText(t('admin.form.duplicate', { count: 1 }))).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ reportId: 'r1', complaintId: '2026-736JEJ', status: 'processing', note: 'ward 112' });
  });
});
