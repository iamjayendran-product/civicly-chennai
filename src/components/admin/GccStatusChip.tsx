import { t } from '@/lib/i18n';
import type { FlagReason } from '@/lib/admin/api';

type GccStatus = 'pending' | 'in_flight' | 'submitted' | 'failed' | 'blocked';

export interface GccChipInput {
  status: GccStatus | null;
  nextAttemptAt: string | null;
  complaintNumber: string | null;
  blockedReason: string | null;
}

const REASONS: FlagReason[] = ['spam', 'duplicate', 'not_road_issue', 'abusive_photo', 'other'];

export function flagReasonLabel(reason: string | null): string | null {
  return reason && (REASONS as string[]).includes(reason) ? t(`admin.reason.${reason as FlagReason}`) : null;
}

/** Short status text for a report's GCC send: countdown during the hold, the complaint
 * number once filed, the flag reason, or a failure. */
export function gccChipLabel(input: GccChipInput, now: Date): string {
  switch (input.status) {
    case 'pending': {
      const ms = input.nextAttemptAt ? new Date(input.nextAttemptAt).getTime() - now.getTime() : 0;
      if (ms <= 0) return t('admin.gcc.sending');
      const minutes = Math.floor(ms / 60_000);
      const time = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
      return t('admin.gcc.countdown', { time });
    }
    case 'in_flight':
      return t('admin.gcc.sending');
    case 'submitted':
      return t('admin.gcc.filed', { number: input.complaintNumber ?? '' });
    case 'blocked': {
      const reason = flagReasonLabel(input.blockedReason);
      return reason ? t('admin.gcc.flaggedReason', { reason }) : t('admin.gcc.flagged');
    }
    case 'failed':
      return t('admin.gcc.failed');
    default:
      return '—';
  }
}

const TONE: Record<GccStatus, string> = {
  // Mid tones: readable on both the light and the (default) dark theme.
  pending: 'bg-amber-500/15 text-amber-500',
  in_flight: 'bg-amber-500/15 text-amber-500',
  submitted: 'bg-emerald-500/15 text-emerald-500',
  blocked: 'bg-red-500/15 text-red-400',
  failed: 'bg-orange-500/15 text-orange-400',
};

export function GccStatusChip({ input, now }: { input: GccChipInput; now: Date }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${input.status ? TONE[input.status] : 'text-muted'}`}>
      {gccChipLabel(input, now)}
    </span>
  );
}
