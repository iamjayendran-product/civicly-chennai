import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];
type Status = Database['public']['Enums']['report_status'];

// Kept in sync by hand with globals.css's tokens (MapLibre paint/icon properties take
// literal colors, not CSS custom properties): pothole = --brand-primary, waterlogging =
// --brand-secondary, other = a mustard tone distinct from both. Fixed reports render in
// a neutral gray regardless of category, so "resolved" reads at a glance.
const CATEGORY_COLORS: Record<Category, string> = {
  pothole: '#ff3b30',
  waterlogging: '#007aff',
  other: '#d4a72c',
};
const FIXED_COLOR = '#8e8e93';

const ICON_SIZE = 48;

export function reportIconId(category: Category, status: Status): string {
  return `report-pin-${category}-${status}`;
}

function drawGlyph(ctx: CanvasRenderingContext2D, category: Category, cx: number, cy: number, s: number) {
  ctx.fillStyle = '#ffffff';
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
    const dotRadius = s * 0.22;
    for (const dx of [-s * 0.6, 0, s * 0.6]) {
      ctx.beginPath();
      ctx.arc(cx + dx, cy, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPinIcon(category: Category, status: Status): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable in this browser');

  const cx = ICON_SIZE / 2;
  const cy = ICON_SIZE / 2;
  const radius = ICON_SIZE / 2 - 3;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = status === 'fixed' ? FIXED_COLOR : CATEGORY_COLORS[category];
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  drawGlyph(ctx, category, cx, cy, ICON_SIZE * 0.22);

  return ctx.getImageData(0, 0, ICON_SIZE, ICON_SIZE);
}

const CATEGORIES: Category[] = ['pothole', 'waterlogging', 'other'];
const STATUSES: Status[] = ['open', 'fixed'];

/** Registers one icon image per category/status combination on the given map, so a
 * symbol layer's `icon-image` can select by `['get', 'iconId']` (see reportIconId). */
export function registerReportIcons(map: { hasImage: (id: string) => boolean; addImage: (id: string, image: ImageData) => void }) {
  for (const category of CATEGORIES) {
    for (const status of STATUSES) {
      const id = reportIconId(category, status);
      if (!map.hasImage(id)) {
        map.addImage(id, drawPinIcon(category, status));
      }
    }
  }
}
