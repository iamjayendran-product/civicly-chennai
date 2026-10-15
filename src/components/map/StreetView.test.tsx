import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { t } from '@/lib/i18n';

const Viewer = vi.fn().mockImplementation(function () {
  return { remove: vi.fn() };
});
vi.mock('mapillary-js', () => ({ Viewer }));
vi.mock('mapillary-js/dist/mapillary.css', () => ({}));

const findNearestImageId = vi.fn<(...args: unknown[]) => Promise<string | null>>();
vi.mock('@/lib/map/mapillary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/map/mapillary')>()),
  findNearestImageId: (...args: unknown[]) => findNearestImageId(...args),
}));

import { StreetView } from './StreetView';
import { STREET_VIEW_LAYER_ID } from '@/lib/map/mapillary';

type Handler = (event?: unknown) => void;

function fakeMap() {
  const layerHandlers: Record<string, Handler> = {};
  let hasLayer = false;
  return {
    layerHandlers,
    getSource: vi.fn(() => (hasLayer ? {} : undefined)),
    getLayer: vi.fn(() => (hasLayer ? {} : undefined)),
    addSource: vi.fn(),
    addLayer: vi.fn(() => {
      hasLayer = true;
    }),
    removeLayer: vi.fn(() => {
      hasLayer = false;
    }),
    removeSource: vi.fn(),
    on: vi.fn((event: string, layerOrHandler: string | Handler, maybeHandler?: Handler) => {
      if (typeof layerOrHandler === 'string' && maybeHandler) layerHandlers[`${event}:${layerOrHandler}`] = maybeHandler;
    }),
    off: vi.fn(),
    getCanvas: vi.fn(() => ({ style: {} })),
  };
}

beforeEach(() => {
  Viewer.mockClear();
  findNearestImageId.mockReset();
});

describe('StreetView', () => {
  it('renders nothing without a Mapillary token', () => {
    const { container } = render(<StreetView mapRef={{ current: fakeMap() as never }} token={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles street-view coverage lines on the map', () => {
    const map = fakeMap();
    render(<StreetView mapRef={{ current: map as never }} token="MLY|t" />);
    const button = screen.getByRole('button', { name: t('map.streetView.toggle') });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(map.addLayer).toHaveBeenCalled();
    expect(screen.getByText(t('map.streetView.hint'))).toBeInTheDocument();

    fireEvent.click(button);
    expect(map.removeLayer).toHaveBeenCalledWith(STREET_VIEW_LAYER_ID);
  });

  it('opens the street-level viewer at the nearest image when a coverage line is tapped', async () => {
    findNearestImageId.mockResolvedValue('img-1');
    const map = fakeMap();
    render(<StreetView mapRef={{ current: map as never }} token="MLY|t" />);
    fireEvent.click(screen.getByRole('button', { name: t('map.streetView.toggle') }));

    map.layerHandlers[`click:${STREET_VIEW_LAYER_ID}`]({ lngLat: { lng: 80.2, lat: 13.05 } });

    await waitFor(() => expect(Viewer).toHaveBeenCalled());
    expect(Viewer.mock.calls[0][0]).toMatchObject({ accessToken: 'MLY|t', imageId: 'img-1' });
    expect(screen.getByRole('dialog', { name: t('map.streetView.title') })).toBeInTheDocument();
    expect(screen.getByText(/Mapillary/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t('map.streetView.close') }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says so when there is no street-level imagery at that spot', async () => {
    findNearestImageId.mockResolvedValue(null);
    const map = fakeMap();
    render(<StreetView mapRef={{ current: map as never }} token="MLY|t" />);
    fireEvent.click(screen.getByRole('button', { name: t('map.streetView.toggle') }));
    map.layerHandlers[`click:${STREET_VIEW_LAYER_ID}`]({ lngLat: { lng: 80.2, lat: 13.05 } });
    expect(await screen.findByText(t('map.streetView.noImagery'))).toBeInTheDocument();
    expect(Viewer).not.toHaveBeenCalled();
  });
});
