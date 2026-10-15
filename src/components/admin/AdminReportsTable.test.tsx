import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import type { AdminReport } from '@/lib/admin/api';

const api = vi.hoisted(() => ({
  listReports: vi.fn(),
  reporterReports: vi.fn(),
  flagReports: vi.fn(),
  setFlagReason: vi.fn(),
  unflagReports: vi.fn(),
  retryGcc: vi.fn(),
  photoUrl: (path: string) => `https://storage.example/${path}`,
}));
vi.mock('@/lib/admin/api', () => api);

import { AdminReportsTable } from './AdminReportsTable';

function report(overrides: Partial<AdminReport>): AdminReport {
  return {
    id: 'r1',
    created_at: '2026-10-15T09:00:00Z',
    category: 'pothole',
    subtype: null,
    note: 'Deep pothole',
    lng: 80.204,
    lat: 13.052,
    status: 'open',
    is_hidden: false,
    upvote_count: 0,
    gcc_street_id: '7553',
    gcc_road_name: 'Arunachalam Street',
    gcc_zone: '10',
    gcc_ward: '129',
    landmark: 'Near Kauvery Hospital',
    reporter_name: 'Ravi K',
    reporter_phone: '9876543212',
    gender: 'male',
    gcc_status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: '2099-01-01T00:00:00Z',
    complaint_number: null,
    blocked_reason: null,
    reporter_report_count: 4,
    photo_paths: ['u/p1.jpg'],
    ...overrides,
  } as AdminReport;
}

beforeEach(() => {
  for (const fn of Object.values(api)) if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
  api.listReports.mockResolvedValue([report({}), report({ id: 'r2', reporter_name: 'Priya', reporter_phone: '9000000045', gcc_ward: '064', reporter_report_count: 1 })]);
  api.flagReports.mockImplementation(async (ids: string[]) => ids.map((id) => ({ report_id: id, already_filed: false, complaint_number: null })));
  api.unflagReports.mockResolvedValue(undefined);
  api.setFlagReason.mockResolvedValue(undefined);
  api.retryGcc.mockResolvedValue(undefined);
  api.reporterReports.mockResolvedValue([]);
});

async function renderLoaded() {
  render(<AdminReportsTable />);
  await screen.findByText('Ravi K');
}

describe('AdminReportsTable', () => {
  it('lists reports waiting to be sent, with reporter details', async () => {
    await renderLoaded();
    expect(api.listReports).toHaveBeenCalledWith(expect.objectContaining({ filter: 'pending' }));
    const row = screen.getByText('Ravi K').closest('tr')!;
    expect(within(row).getByText('9876543212')).toBeInTheDocument();
    expect(within(row).getByText('(4)')).toBeInTheDocument();
    expect(within(row).getByText('129')).toBeInTheDocument();
    expect(within(row).getByText(t('report.category.pothole'))).toBeInTheDocument();
  });

  it('flags a report in one click and offers Undo', async () => {
    await renderLoaded();
    const row = screen.getByText('Ravi K').closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: t('admin.flag') }));
    await waitFor(() => expect(api.flagReports).toHaveBeenCalledWith(['r1']));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(t('admin.toast.flagged', { count: 1 }));
    fireEvent.click(within(toast).getByRole('button', { name: t('admin.undo') }));
    await waitFor(() => expect(api.unflagReports).toHaveBeenCalledWith(['r1']));
  });

  it('records an optional reason picked from the toast', async () => {
    await renderLoaded();
    fireEvent.click(within(screen.getByText('Ravi K').closest('tr')!).getByRole('button', { name: t('admin.flag') }));
    const toast = await screen.findByRole('status');
    fireEvent.click(within(toast).getByRole('button', { name: t('admin.reason.spam') }));
    await waitFor(() => expect(api.setFlagReason).toHaveBeenCalledWith('r1', 'spam'));
  });

  it('says when a flagged report was already filed with GCC', async () => {
    api.flagReports.mockResolvedValue([{ report_id: 'r1', already_filed: true, complaint_number: '48213' }]);
    await renderLoaded();
    fireEvent.click(within(screen.getByText('Ravi K').closest('tr')!).getByRole('button', { name: t('admin.flag') }));
    expect(await screen.findByText(t('admin.toast.alreadyFiled', { number: '48213' }))).toBeInTheDocument();
  });

  it('flags several selected reports at once', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('checkbox', { name: t('admin.select', { name: 'Ravi K' }) }));
    fireEvent.click(screen.getByRole('checkbox', { name: t('admin.select', { name: 'Priya' }) }));
    fireEvent.click(screen.getByRole('button', { name: t('admin.flagSelected', { count: 2 }) }));
    await waitFor(() => expect(api.flagReports).toHaveBeenCalledWith(['r1', 'r2']));
  });

  it('switches filters and retries a failed send', async () => {
    await renderLoaded();
    api.listReports.mockResolvedValue([report({ id: 'r9', reporter_name: 'Kumar', gcc_status: 'failed', last_error: 'GCC responded HTTP 502' })]);
    fireEvent.change(screen.getByLabelText(t('admin.filter.label')), { target: { value: 'failed' } });
    await screen.findByText('Kumar');
    expect(api.listReports).toHaveBeenLastCalledWith(expect.objectContaining({ filter: 'failed' }));

    fireEvent.click(screen.getByText('Kumar'));
    expect(await screen.findByText('GCC responded HTTP 502')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t('admin.retry') }));
    await waitFor(() => expect(api.retryGcc).toHaveBeenCalledWith('r9'));
  });

  it('expands a row to show photos, location, gender and the reporter’s other reports', async () => {
    api.reporterReports.mockResolvedValue([
      { id: 'o1', created_at: '2026-10-14T09:00:00Z', category: 'waterlogging', subtype: null, is_hidden: false, gcc_status: 'submitted' },
    ]);
    await renderLoaded();
    fireEvent.click(screen.getByText('Ravi K'));
    await waitFor(() => expect(api.reporterReports).toHaveBeenCalledWith('r1'));
    expect(screen.getByAltText(t('admin.photoAlt'))).toHaveAttribute('src', 'https://storage.example/u/p1.jpg');
    expect(screen.getByText(/Near Kauvery Hospital/)).toBeInTheDocument();
    expect(screen.getByText(t('report.contact.gender.male'))).toBeInTheDocument();
    expect(await screen.findByText(t('report.category.waterlogging'), { selector: 'li *, li' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('admin.openMap') })).toHaveAttribute('href', expect.stringContaining('13.052'));
  });
});
