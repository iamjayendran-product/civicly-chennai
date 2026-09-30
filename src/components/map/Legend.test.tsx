import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import { Legend } from './Legend';

describe('Legend', () => {
  it('starts collapsed, showing only the toggle button', () => {
    render(<Legend />);
    expect(screen.getByRole('button', { name: t('map.legend.toggle') })).toBeInTheDocument();
    expect(screen.queryByText(t('report.status.open'))).not.toBeInTheDocument();
  });

  it('expands to show the open/fixed pin color meanings on tap, and collapses again on a second tap', () => {
    render(<Legend />);

    fireEvent.click(screen.getByRole('button', { name: t('map.legend.toggle') }));
    expect(screen.getByText(t('report.status.open'))).toBeInTheDocument();
    expect(screen.getByText(t('report.status.fixed'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('map.legend.toggle') }));
    expect(screen.queryByText(t('report.status.open'))).not.toBeInTheDocument();
  });
});
