const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

// "21 Oct"
export function formatShortDate(iso: string): string {
  return shortDate.format(new Date(iso));
}

// "3 days ago", "yesterday", "5 hours ago"
export function formatRelative(iso: string, now: Date = new Date()): string {
  const minutes = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}
