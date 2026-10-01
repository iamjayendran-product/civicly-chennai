'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { GateBackgroundMap } from './GateBackgroundMap';

const SEEN_KEY = 'civicly-splash-seen';
const FADE_MS = 400;
const RIPPLE_COUNT = 5;
// Must match the `civicly-ripple` keyframe's animation-duration in globals.css —
// spacing rings evenly across one full cycle is what makes the count/density tunable
// from just these two numbers instead of hand-listing each delay.
const RIPPLE_CYCLE_S = 1.5;

type Phase = 'checking' | 'gate' | 'fading' | 'entered';

/** Gates the real app (passed as `children`, which doesn't mount until this reaches
 * 'entered') behind a full-screen entry screen — its own decorative map, not the live
 * homepage, so none of the real app's controls ever show through it. Shown once per
 * tab session; stays up until the citizen taps through, since there's no separate
 * marketing landing page to carry that first impression. */
export function EntryGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase(sessionStorage.getItem(SEEN_KEY) ? 'entered' : 'gate');
  }, []);

  function enter() {
    sessionStorage.setItem(SEEN_KEY, '1');
    setPhase('fading');
    setTimeout(() => setPhase('entered'), FADE_MS);
  }

  if (phase === 'checking') return null;
  if (phase === 'entered') return <>{children}</>;

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-black transition-opacity duration-[400ms] ${
        phase === 'fading' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <GateBackgroundMap />
      {/* The map should only read as a faint hint, not a visible scene — most of what
          sits on top of it is this near-opaque, irregularly-gradiented scrim (see
          .civicly-gate-scrim in globals.css). */}
      <div className="civicly-gate-scrim absolute inset-0 z-10" />
      {/* RIPPLE_COUNT rings, evenly staggered across one RIPPLE_CYCLE_S cycle, so a
          new one fires well before the previous finishes — a continuous back-to-back
          pulse train instead of a single ring with gaps. */}
      {Array.from({ length: RIPPLE_COUNT }, (_, i) => (
        <span
          key={i}
          className="civicly-ripple pointer-events-none"
          style={{ animationDelay: `${(i * RIPPLE_CYCLE_S) / RIPPLE_COUNT}s` }}
          aria-hidden="true"
        />
      ))}
      <div className="relative z-20 flex h-full flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex h-36 w-36 items-center justify-center">
            <span className="absolute inset-3 animate-pulse rounded-full bg-secondary/25 blur-md" />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="civicly-heartbeat relative h-16 w-16 text-primary drop-shadow-[0_0_18px_rgba(255,69,58,0.65)]"
              aria-hidden="true"
            >
              <path
                d="M12 2c-4.4 0-8 3.6-8 8 0 5.4 6.6 11.4 7.3 12a1 1 0 0 0 1.4 0c.7-.6 7.3-6.6 7.3-12 0-4.4-3.6-8-8-8z"
                fill="currentColor"
              />
              <circle cx="12" cy="10" r="3" fill="black" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('splash.title')}</h1>
        </div>
        <button
          type="button"
          onClick={enter}
          className="rounded-full bg-primary px-6 py-3 text-base font-semibold text-white shadow-[0_0_24px_rgba(255,69,58,0.5)] transition-transform active:scale-95"
        >
          {t('splash.cta')}
        </button>
      </div>
    </div>
  );
}
