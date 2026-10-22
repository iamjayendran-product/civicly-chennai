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

  it('has no 3D button unless the map supports it', () => {
    render(<MapSatelliteToggle value="light" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: t('map.style.view3d') })).not.toBeInTheDocument();
  });

  it('shows 3D as pressed and turns it off', () => {
    const onToggle3d = vi.fn();
    render(<MapSatelliteToggle value="satellite" onChange={vi.fn()} is3d onToggle3d={onToggle3d} />);
    const button = screen.getByRole('button', { name: t('map.style.view3d') });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onToggle3d).toHaveBeenCalledWith(false);
  });

  it('keeps Map pressed in the dark theme', () => {
    render(<MapSatelliteToggle value="dark" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('map.style.map') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers Light and Dark only in the Map view', () => {
    const { rerender } = render(<MapSatelliteToggle value="light" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('map.style.light') })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: t('map.style.dark') })).toHaveAttribute('aria-pressed', 'false');
    rerender(<MapSatelliteToggle value="satellite" onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: t('map.style.dark') })).not.toBeInTheDocument();
  });

  it('switches the map to the dark theme', () => {
    const onChange = vi.fn();
    render(<MapSatelliteToggle value="light" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: t('map.style.dark') }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('marks Map pressed for the street map', () => {
    render(<MapSatelliteToggle value="light" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: t('map.style.map') })).toHaveAttribute('aria-pressed', 'true');
  });
});
