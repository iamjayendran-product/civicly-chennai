// GCC's street register, read from its public ArcGIS layer — the same layer GCC's own
// complaint form (gccservices.in/pgr/registercomplaints) uses to pick a street. A GCC
// complaint needs the street's `road_id` as its StreetId. Client-safe: no secrets, and
// the GIS server allows cross-origin reads.

const STREETS_LAYER_URL =
  'https://gisgcc.chennaicorporation.gov.in/server/rest/services/GCCDepts/EDPMobile2025/FeatureServer/0/query';
const OUT_FIELDS = 'road_id,road_name,new_zone,new_ward,region,gis_id,type';
const NEAR_DISTANCE_M = 25;
const SEARCH_LIMIT = 8;
const DEFAULT_TIMEOUT_MS = 5000;

export interface GccStreet {
  roadId: string;
  roadName: string;
  zone: string | null;
  ward: string | null;
  region: string | null;
  /** A point on the street, for flying the map to it. */
  anchor: { lng: number; lat: number };
  /** Metres from the queried point, when one was given. */
  distanceM?: number;
}

export type StreetsNearResult = { status: 'ok'; streets: GccStreet[] } | { status: 'none' } | { status: 'error' };

interface FetchOptions {
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
}

export function buildStreetsNearUrl(lng: number, lat: number): string {
  const params = new URLSearchParams({
    where: '',
    geometry: JSON.stringify({ x: lng, y: lat }),
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: String(NEAR_DISTANCE_M),
    units: 'esriSRUnit_Meter',
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '6',
    f: 'geojson',
  });
  return `${STREETS_LAYER_URL}?${params.toString()}`;
}

export function buildRoadSearchUrl(query: string): string {
  // The query is interpolated into the layer's SQL `where`; keep only characters a road
  // name needs so it can't break out of the string literal or add LIKE wildcards.
  const safe = query
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-]/g, '')
    .replace(/-{2,}/g, '')
    .replace(/\s+/g, ' ');
  const params = new URLSearchParams({
    where: `UPPER(road_name) LIKE '%${safe}%'`,
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '6',
    resultRecordCount: String(SEARCH_LIMIT),
    f: 'geojson',
  });
  return `${STREETS_LAYER_URL}?${params.toString()}`;
}

type Position = [number, number];

function linesOf(geometry: unknown): Position[][] {
  if (!geometry || typeof geometry !== 'object') return [];
  const { type, coordinates } = geometry as { type?: string; coordinates?: unknown };
  if (type === 'LineString' && Array.isArray(coordinates)) return [coordinates as Position[]];
  if (type === 'MultiLineString' && Array.isArray(coordinates)) return coordinates as Position[][];
  return [];
}

/** Metres from p to segment a–b, on a local equirectangular projection (fine at 25 m). */
function distanceToSegmentM(p: { lng: number; lat: number }, a: Position, b: Position): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = mPerDegLat * Math.cos((p.lat * Math.PI) / 180);
  const ax = (a[0] - p.lng) * mPerDegLng;
  const ay = (a[1] - p.lat) * mPerDegLat;
  const bx = (b[0] - p.lng) * mPerDegLng;
  const by = (b[1] - p.lat) * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function parseStreets(raw: unknown, near?: { lng: number; lat: number }): GccStreet[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { features?: unknown }).features)) return [];
  const streets: GccStreet[] = [];
  for (const feature of (raw as { features: unknown[] }).features) {
    const props = ((feature as { properties?: unknown })?.properties ?? {}) as Record<string, unknown>;
    const roadId = str(props.road_id);
    const roadName = str(props.road_name);
    if (!roadId || !roadName) continue;
    const lines = linesOf((feature as { geometry?: unknown }).geometry).filter((line) => line.length > 0);
    const allPoints = lines.flat();
    const mid = allPoints[Math.floor(allPoints.length / 2)];
    const street: GccStreet = {
      roadId,
      roadName,
      zone: str(props.new_zone),
      ward: str(props.new_ward),
      region: str(props.region),
      anchor: mid ? { lng: mid[0], lat: mid[1] } : near ?? { lng: 0, lat: 0 },
    };
    if (near && lines.length > 0) {
      let best = Infinity;
      for (const line of lines) {
        if (line.length === 1) best = Math.min(best, distanceToSegmentM(near, line[0], line[0]));
        for (let i = 1; i < line.length; i++) best = Math.min(best, distanceToSegmentM(near, line[i - 1], line[i]));
      }
      street.distanceM = Math.round(best);
    }
    streets.push(street);
  }
  if (near) streets.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
  return streets;
}

async function getJson(url: string, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: FetchOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`GCC GIS responded ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** GCC streets within 25 m of a point, nearest first. */
export async function fetchStreetsNear(lng: number, lat: number, options: FetchOptions = {}): Promise<StreetsNearResult> {
  try {
    const streets = parseStreets(await getJson(buildStreetsNearUrl(lng, lat), options), { lng, lat });
    return streets.length > 0 ? { status: 'ok', streets } : { status: 'none' };
  } catch {
    return { status: 'error' };
  }
}

/** GCC streets whose name contains the query (min 3 characters). Never throws. */
export async function searchRoads(query: string, options: FetchOptions = {}): Promise<GccStreet[]> {
  if (query.trim().length < 3) return [];
  try {
    return parseStreets(await getJson(buildRoadSearchUrl(query.trim()), options));
  } catch {
    return [];
  }
}
