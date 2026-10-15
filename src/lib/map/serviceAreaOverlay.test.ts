import { describe, it, expect, vi } from 'vitest';
import { GCC_BOUNDARY } from '@/lib/geo/serviceArea';
import {
  SERVICE_AREA_MASK_LAYER_ID,
  SERVICE_AREA_OUTLINE_LAYER_ID,
  addServiceAreaOverlay,
  buildOutsideMask,
} from './serviceAreaOverlay';

describe('buildOutsideMask', () => {
  it('is a world-sized polygon with the GCC boundary cut out as a hole', () => {
    const mask = buildOutsideMask();
    expect(mask.type).toBe('Feature');
    expect(mask.geometry.type).toBe('Polygon');
    const [outer, hole] = mask.geometry.coordinates;
    expect(outer).toEqual([
      [-180, -85],
      [180, -85],
      [180, 85],
      [-180, 85],
      [-180, -85],
    ]);
    expect(hole).toEqual(GCC_BOUNDARY.coordinates[0]);
  });
});

describe('addServiceAreaOverlay', () => {
  it('adds a dim mask outside GCC and an outline of the GCC boundary', () => {
    const map = { addSource: vi.fn(), addLayer: vi.fn(), getSource: vi.fn(() => undefined) };
    addServiceAreaOverlay(map as never);

    expect(map.addSource).toHaveBeenCalledTimes(2);
    const layerIds = map.addLayer.mock.calls.map(([layer]) => (layer as { id: string }).id);
    expect(layerIds).toEqual([SERVICE_AREA_MASK_LAYER_ID, SERVICE_AREA_OUTLINE_LAYER_ID]);
  });

  it('is a no-op when the overlay is already on the current style', () => {
    const map = { addSource: vi.fn(), addLayer: vi.fn(), getSource: vi.fn(() => ({})) };
    addServiceAreaOverlay(map as never);
    expect(map.addSource).not.toHaveBeenCalled();
    expect(map.addLayer).not.toHaveBeenCalled();
  });
});
