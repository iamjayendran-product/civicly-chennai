import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';
import roadSuggestions from '@/lib/gcc/__fixtures__/road-suggestions-arunachalam.json';
import { LocationSearch } from './LocationSearch';

const nominatim = [{ lat: '13.0520', lon: '80.2040', display_name: 'Arunachalam Road, Vadapalani, Chennai' }];

function mockFetch() {
  const fetchMock = vi.fn((url: string) => {
    const body = url.includes('gisgcc.chennaicorporation.gov.in') ? roadSuggestions : nominatim;
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('LocationSearch', () => {
  it('lists GCC streets (with ward and zone) above general places', async () => {
    mockFetch();
    render(<LocationSearch onSelect={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(t('map.search.placeholder')), { target: { value: 'arunachalam' } });

    await waitFor(() => expect(screen.getAllByRole('button')).toHaveLength(9));
    const labels = screen.getAllByRole('button').map((b) => b.textContent);
    expect(labels[0]).toBe('V.P. Arunachalam Street — Ward 137, Zone 10');
    expect(labels.at(-1)).toBe('Arunachalam Road, Vadapalani, Chennai');
  });

  it('flies to a picked GCC street', async () => {
    mockFetch();
    const onSelect = vi.fn();
    render(<LocationSearch onSelect={onSelect} />);
    fireEvent.change(screen.getByPlaceholderText(t('map.search.placeholder')), { target: { value: 'arunachalam' } });
    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(1));

    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'V.P. Arunachalam Street — Ward 137, Zone 10', lng: expect.any(Number), lat: expect.any(Number) })
    );
  });
});
