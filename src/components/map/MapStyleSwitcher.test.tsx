import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import { MapStyleSwitcher } from './MapStyleSwitcher';

describe('MapStyleSwitcher', () => {
  it('opens a menu of views, marks the current one and reports the pick', () => {
    const onChange = vi.fn();
    const onToggle3d = vi.fn();
    render(<MapStyleSwitcher value="light" onChange={onChange} is3d={false} onToggle3d={onToggle3d} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('map.style.title') }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(4);
    expect(screen.getByRole('menuitemradio', { name: new RegExp(t('map.style.light')) })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('menuitemradio', { name: t('map.style.dark') }));
    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers 3D as a toggle next to the views', () => {
    const onToggle3d = vi.fn();
    render(<MapStyleSwitcher value="light" onChange={vi.fn()} is3d={false} onToggle3d={onToggle3d} />);
    fireEvent.click(screen.getByRole('button', { name: t('map.style.title') }));
    const toggle = screen.getByRole('menuitemcheckbox', { name: t('map.style.view3d') });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(onToggle3d).toHaveBeenCalledWith(true);
  });
});
