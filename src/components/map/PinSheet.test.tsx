import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import type { ReportPin } from '@/lib/realtime/useReports';
import { PinSheet } from './PinSheet';

const base: ReportPin = {
  id: 'r1',
  category: 'pothole',
  subtype: null,
  note: null,
  lng: 80.2,
  lat: 13.05,
  status: 'open',
  upvoteCount: 0,
  createdAt: '2026-10-15T00:00:00Z',
  gccStatus: 'pending',
  gccComplaintNumber: null,
};

describe('PinSheet GCC status', () => {
  it('shows the GCC complaint number once filed', () => {
    render(<PinSheet report={{ ...base, gccStatus: 'submitted', gccComplaintNumber: '2026-48213' }} onClose={vi.fn()} />);
    expect(screen.getByText(t('pinSheet.gcc.submitted', { number: '2026-48213' }))).toBeInTheDocument();
  });

  it('says it is being filed while pending', () => {
    render(<PinSheet report={base} onClose={vi.fn()} />);
    expect(screen.getByText(t('pinSheet.gcc.pending'))).toBeInTheDocument();
  });

  it('says when filing with GCC failed', () => {
    render(<PinSheet report={{ ...base, gccStatus: 'failed' }} onClose={vi.fn()} />);
    expect(screen.getByText(t('pinSheet.gcc.failed'))).toBeInTheDocument();
  });

  it('shows nothing about GCC for reports that were never queued', () => {
    render(<PinSheet report={{ ...base, gccStatus: null }} onClose={vi.fn()} />);
    expect(screen.queryByText(t('pinSheet.gcc.pending'))).not.toBeInTheDocument();
  });
});
