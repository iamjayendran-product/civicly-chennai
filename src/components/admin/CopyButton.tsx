'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {});
      }}
      className="rounded-full border border-line px-3 py-1 text-xs text-foreground transition-transform active:scale-95"
    >
      {copied ? t('admin.copy.done') : label}
    </button>
  );
}
