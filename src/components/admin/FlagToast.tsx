'use client';

import { t } from '@/lib/i18n';
import type { FlagReason } from '@/lib/admin/api';

const REASONS: FlagReason[] = ['spam', 'duplicate', 'not_road_issue', 'abusive_photo', 'other'];

export interface FlagToastProps {
  count: number;
  /** Complaint numbers of flagged reports GCC had already filed. */
  alreadyFiled: string[];
  reason: FlagReason | null;
  onReason: (reason: FlagReason) => void;
  onUndo: () => void;
  onDismiss: () => void;
}

/** Shown right after a flag: confirms it, offers Undo, and an optional reason. */
export function FlagToast({ count, alreadyFiled, reason, onReason, onUndo, onDismiss }: FlagToastProps) {
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-20 flex w-[min(40rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2 rounded-2xl bg-neutral-900 p-3 text-sm text-white shadow-2xl"
    >
      <div className="flex items-center gap-3">
        <p className="flex-1">{t('admin.toast.flagged', { count })}</p>
        <button type="button" onClick={onUndo} className="rounded-lg bg-white/15 px-3 py-1 font-semibold">
          {t('admin.undo')}
        </button>
        <button type="button" onClick={onDismiss} aria-label={t('admin.toast.dismiss')} className="px-1 text-white/70">
          ✕
        </button>
      </div>
      {alreadyFiled.map((number) => (
        <p key={number} className="text-xs text-amber-300">
          {t('admin.toast.alreadyFiled', { number })}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-white/70">{t('admin.toast.reason')}</span>
        {REASONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={reason === option}
            onClick={() => onReason(option)}
            className={`rounded-full border px-2 py-0.5 ${reason === option ? 'border-white bg-white text-neutral-900' : 'border-white/30'}`}
          >
            {t(`admin.reason.${option}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
