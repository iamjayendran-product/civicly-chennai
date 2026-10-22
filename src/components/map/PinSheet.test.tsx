import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
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
};

describe('PinSheet', () => {
  it('does not show anything about GCC filing to citizens', () => {
    render(<PinSheet report={base} onClose={vi.fn()} />);
    expect(screen.queryByText(/GCC|Corporation|2026-48213/)).not.toBeInTheDocument();
  });
});
