import { DEFAULT_MAP_STYLE_ID, getMapStyle, type MapStyleId } from './styles';

// One saved appearance (basemap view + 3D) shared by every map in the app — the
// Discovery page and the report form's location picker — so a citizen's choice follows
// them from page to page.
const STYLE_KEY = 'civicly-map-style';
const THREE_D_KEY = 'civicly-map-3d';

export const PITCH_3D = 60;
export const BEARING_3D = -20;

export interface MapAppearance {
  styleId: MapStyleId;
  is3d: boolean;
}

export function loadAppearance(): MapAppearance {
  try {
    const saved3d = localStorage.getItem(THREE_D_KEY);
    return {
      styleId: getMapStyle(localStorage.getItem(STYLE_KEY)).id,
      // Nothing saved yet means the default (3D on); a stored value must be exactly '1'.
      is3d: saved3d === null ? true : saved3d === '1',
    };
  } catch {
    // Storage can be unavailable (private mode, SSR): fall back to the defaults.
    return { styleId: DEFAULT_MAP_STYLE_ID, is3d: true };
  }
}

export function saveAppearance(patch: Partial<MapAppearance>): void {
  try {
    if (patch.styleId !== undefined) localStorage.setItem(STYLE_KEY, patch.styleId);
    if (patch.is3d !== undefined) localStorage.setItem(THREE_D_KEY, patch.is3d ? '1' : '0');
  } catch {
    // The choice just won't persist.
  }
}
