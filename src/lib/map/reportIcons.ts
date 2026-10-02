import type { Database } from '@/lib/supabase/database.types';
import { MAP_COLORS } from './colors';

type Category = Database['public']['Enums']['report_category'];
type Status = Database['public']['Enums']['report_status'];

// Fixed reports render in a neutral gray regardless of category, so "resolved" reads
// at a glance.
const CATEGORY_COLORS: Record<Category, string> = {
  pothole: MAP_COLORS.pothole,
  waterlogging: MAP_COLORS.waterlogging,
  other: MAP_COLORS.other,
};
const FIXED_COLOR = MAP_COLORS.fixed;

// Google-Maps-style teardrop pin: a coloured drop with a white disc near the top that
// carries the category symbol. Drawn once from this Path2D (24x24 viewBox, tip at the
// bottom centre) and reused for the map layer and the entry-page pin, so they match.
const PIN_PATH = 'M12 1C7.6 1 4 4.6 4 9c0 5.7 6.6 13 7.3 13.8a.9.9 0 0 0 1.4 0C13.4 22 20 14.7 20 9c0-4.4-3.6-8-8-8z';
const PIN_VIEWBOX = { w: 24, h: 24 };
/** CSS-pixel size of a pin on the map; the canvas is drawn at PIXEL_RATIO for sharpness. */
export const PIN_SIZE = { w: 36, h: 36 };
const PIXEL_RATIO = 2;

export function reportIconId(category: Category, status: Status): string {
  return `report-pin-${category}-${status}`;
}

function pinColor(category: Category, status: Status): string {
  return status === 'fixed' ? FIXED_COLOR : CATEGORY_COLORS[category];
}

// Glyphs are drawn in the pin's own colour on the white disc, centred on (cx, cy) in
// viewBox units, with `s` as the half-size.
function drawGlyph(ctx: CanvasRenderingContext2D, category: Category, color: string, cx: number, cy: number, s: number) {
  ctx.fillStyle = color;
  if (category === 'pothole') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.lineTo(cx + s, cy + s * 0.8);
    ctx.lineTo(cx - s, cy + s * 0.8);
    ctx.closePath();
    ctx.fill();
  } else if (category === 'waterlogging') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.bezierCurveTo(cx + s, cy, cx + s * 0.7, cy + s, cx, cy + s);
    ctx.bezierCurveTo(cx - s * 0.7, cy + s, cx - s, cy, cx, cy - s);
    ctx.closePath();
    ctx.fill();
  } else {
    const dotRadius = s * 0.24;
    for (const dx of [-s * 0.62, 0, s * 0.62]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPinCanvas(category: Category, status: Status): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_SIZE.w * PIXEL_RATIO;
  canvas.height = PIN_SIZE.h * PIXEL_RATIO;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable in this browser');

  const color = pinColor(category, status);
  ctx.scale((canvas.width / PIN_VIEWBOX.w), (canvas.height / PIN_VIEWBOX.h));

  const path = new Path2D(PIN_PATH);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 1.2;
  ctx.shadowOffsetY = 0.4;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke(path);

  ctx.beginPath();
  ctx.arc(12, 9, 5.2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  drawGlyph(ctx, category, color, 12, 9.2, 3);

  return canvas;
}

function drawPinIcon(category: Category, status: Status): ImageData {
  const canvas = drawPinCanvas(category, status);
  return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
}

/** The same pin as a PNG data URL, for DOM markers outside the map's symbol layer. */
export function reportPinDataUrl(category: Category, status: Status): string {
  return drawPinCanvas(category, status).toDataURL('image/png');
}

const CATEGORIES: Category[] = ['pothole', 'waterlogging', 'other'];
const STATUSES: Status[] = ['open', 'fixed'];

/** Registers one icon image per category/status combination on the given map, so a
 * symbol layer's `icon-image` can select by `['get', 'iconId']` (see reportIconId). */
export function registerReportIcons(map: { hasImage: (id: string) => boolean; addImage: (id: string, image: ImageData, options?: { pixelRatio?: number }) => void }) {
  for (const category of CATEGORIES) {
    for (const status of STATUSES) {
      const id = reportIconId(category, status);
      if (!map.hasImage(id)) {
        map.addImage(id, drawPinIcon(category, status), { pixelRatio: PIXEL_RATIO });
      }
    }
  }
}
