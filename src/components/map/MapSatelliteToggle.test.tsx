import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import { MapSatelliteToggle } from './MapSatelliteToggle';

describe('MapSatelliteToggle', () => {
  it('shows Map and Satellite as a two-way switch with the current one pressed', () => {
    render(<MapSatelliteToggle value="satellite" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('map.style.map') })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: t('map.style.satellite') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to the street map', () => {
    const onChange = vi.fn();
    render(<MapSatelliteToggle value="satellite" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: t('map.style.map') }));
    expect(onChange).toHaveBeenCalledWith('light');
  });

  it('switches to satellite', () => {
    const onChange = vi.fn();
    render(<MapSatelliteToggle value="light" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: t('map.style.satellite') }));
    expect(onChange).toHaveBeenCalledWith('satellite');
  });

  it('marks Map pressed for the street map', () => {
    render(<MapSatelliteToggle value="light" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('map.style.map') })).toHaveAttribute('aria-pressed', 'true');
  });
});
