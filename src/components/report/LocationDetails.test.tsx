import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import type { GccStreet } from '@/lib/gcc/streetLookup';
import { LocationDetails, type LocationDetailsProps } from './LocationDetails';

const VADAPALANI = { lng: 80.204032, lat: 13.05202 };
const streets: GccStreet[] = [
  { roadId: '7553', roadName: 'Arunachalam Street', zone: '10', ward: '129', region: 'Central', anchor: VADAPALANI, distanceM: 4 },
  { roadId: '3438', roadName: 'S.S.R.Pangajam Street', zone: '10', ward: '129', region: 'Central', anchor: VADAPALANI, distanceM: 18 },
];

function renderDetails(overrides: Partial<LocationDetailsProps> = {}) {
  const props: LocationDetailsProps = {
    location: VADAPALANI,
    status: 'ok',
    streets,
    selectedRoadId: '7553',
    landmark: 'Arunachalam Street',
    onSelectStreet: vi.fn(),
    onChangeLandmark: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  render(<LocationDetails {...props} />);
  return props;
}

describe('LocationDetails', () => {
  it('shows the pin latitude and longitude to 6 decimals, read-only', () => {
    renderDetails();
    expect(screen.getByLabelText(t('report.location.latitude'))).toHaveValue('13.052020');
    expect(screen.getByLabelText(t('report.location.longitude'))).toHaveValue('80.204032');
    expect(screen.getByLabelText(t('report.location.latitude'))).toHaveAttribute('readonly');
  });

  it('lists GCC streets near the pin and reports the chosen one', () => {
    const props = renderDetails();
    const select = screen.getByLabelText(t('report.location.street'));
    expect(select).toHaveValue('7553');
    expect(screen.getByRole('option', { name: 'S.S.R.Pangajam Street' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: '3438' } });
    expect(props.onSelectStreet).toHaveBeenCalledWith('3438');
  });

  it('lets the reporter edit the landmark', () => {
    const props = renderDetails();
    fireEvent.change(screen.getByLabelText(t('report.location.landmark')), { target: { value: 'Near Kauvery Hospital' } });
    expect(props.onChangeLandmark).toHaveBeenCalledWith('Near Kauvery Hospital');
  });

  it('asks the reporter to move the pin when GCC has no street there', () => {
    renderDetails({ status: 'none', streets: [], selectedRoadId: null, landmark: '' });
    expect(screen.getByText(t('report.location.noStreet'))).toBeInTheDocument();
  });

  it('offers a retry when GCC street lookup fails', () => {
    const props = renderDetails({ status: 'error', streets: [], selectedRoadId: null, landmark: '' });
    fireEvent.click(screen.getByRole('button', { name: t('report.location.retry') }));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('shows a loading state while looking up streets', () => {
    renderDetails({ status: 'loading', streets: [], selectedRoadId: null, landmark: '' });
    expect(screen.getByText(t('report.location.loadingStreets'))).toBeInTheDocument();
  });

  it('tells the reporter when the pin is outside GCC limits', () => {
    renderDetails({ status: 'outside', streets: [], selectedRoadId: null, landmark: '' });
    expect(screen.getByText(t('report.errors.OUTSIDE_GCC'))).toBeInTheDocument();
  });

  it('prompts to place a pin when there is no location yet', () => {
    renderDetails({ location: null, status: 'idle', streets: [], selectedRoadId: null, landmark: '' });
    expect(screen.getByText(t('report.errors.LOCATION_REQUIRED'))).toBeInTheDocument();
  });
});
