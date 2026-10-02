import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleId = 'light' | 'dark' | 'terrain' | 'satellite';

export interface MapStyleOption {
  id: MapStyleId;
  /** Key into the i18n catalog. */
  labelKey: `map.style.${MapStyleId}`;
  /** A style URL (vector) or an inline style (raster basemaps). */
  style: string | StyleSpecification;
}

const LIGHT_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty';

// Raster basemaps ship no glyphs of their own, but the report layer's "+N" confirm
// badge is a text label — borrow OpenFreeMap's font server (the same one the vector
// styles use) so those labels keep working after switching.
const GLYPHS_URL = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

function rasterStyle(tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: { basemap: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution } },
    layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
  };
}

export const MAP_STYLES: MapStyleOption[] = [
  { id: 'light', labelKey: 'map.style.light', style: LIGHT_STYLE_URL },
  { id: 'dark', labelKey: 'map.style.dark', style: 'https://tiles.openfreemap.org/styles/dark' },
  {
    id: 'terrain',
    labelKey: 'map.style.terrain',
    style: rasterStyle(
      ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
      '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
      17
    ),
  },
  {
    id: 'satellite',
    labelKey: 'map.style.satellite',
    style: rasterStyle(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Imagery © Esri, Maxar, Earthstar Geographics',
      19
    ),
  },
];

export const DEFAULT_MAP_STYLE_ID: MapStyleId = 'light';

export function getMapStyle(id: string | null | undefined): MapStyleOption {
  return MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES.find((s) => s.id === DEFAULT_MAP_STYLE_ID)!;
}
