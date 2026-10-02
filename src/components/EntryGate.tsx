'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t } from '@/lib/i18n';
import { GateBackgroundMap } from './GateBackgroundMap';
import { reportPinDataUrl } from '@/lib/map/reportIcons';

const FADE_MS = 400;
const RIPPLE_COUNT = 5;
// Must match the `civicly-ripple` keyframe's animation-duration in globals.css —
// spacing rings evenly across one full cycle is what makes the count/density tunable
// from just these two numbers instead of hand-listing each delay.
const RIPPLE_CYCLE_S = 3;

/** The entry page at `/`: a full-screen animated screen with its own decorative map
 * (not the live homepage). Stays up until the citizen taps through to `/home`, since
 * there's no separate marketing landing page to carry that first impression. */
export function EntryGate() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const logoRef = useRef<HTMLDivElement>(null);
  // Where the logo pin sits on screen. The map is only created once this is known, so
  // it can be framed to put Chennai exactly there.
  const [logo, setLogo] = useState<{ x: number; y: number; tipY: number } | null>(null);
  const [pinSrc, setPinSrc] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      const rect = logoRef.current?.getBoundingClientRect();
      if (rect) {
        const y = rect.top + rect.height / 2;
        // The 64px logo is centred in its box; its tip is ~26px below centre.
        setLogo({ x: rect.left + rect.width / 2, y, tipY: y + 26 });
      }
    }, 0);
    return () => clearTimeout(id);
  }, []);

  function enter() {
    setLeaving(true);
    router.prefetch('/home');
    setTimeout(() => router.push('/home'), FADE_MS);
  }

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-black transition-opacity duration-[400ms] ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {logo && <GateBackgroundMap focalY={logo.tipY} onSettled={() => setPinSrc(reportPinDataUrl('pothole', 'open'))} />}
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
      {/* Chennai's pin lives here rather than inside the map so the scrim above doesn't
          dim it. It drops onto exactly the same spot as the logo pin and stays behind it
          (z-15 vs the logo's z-20), so the citizen sees a single pin. */}
      {logo && pinSrc && (
        <div className="pointer-events-none absolute z-[15]" style={{ left: logo.x, top: logo.y, translate: '-50% -50%' }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL. */}
          <img src={pinSrc} alt="" width={64} height={64} className="civicly-pin-drop" />
        </div>
      )}
      <p className="absolute bottom-3 left-0 right-0 z-20 text-center text-[10px] text-muted">{t('splash.imageryCredit')}</p>
      <div className="relative z-20 flex h-full flex-col items-center justify-center gap-8">
        <div className="flex flex-col items-center gap-5">
          <div ref={logoRef} className="relative flex h-36 w-36 items-center justify-center">
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
          {/* Always rendered (never gated on later state) so the logo's measured position,
              which the globe pin is aligned to, doesn't shift after mount. */}
          <h2 className="-mt-2 flex flex-col items-center text-center text-4xl font-black uppercase leading-[1.05] tracking-tight">
            <span className="civicly-tagline text-foreground" style={{ animationDelay: '0.3s' }}>
              {t('splash.taglineLine1')}
            </span>
            <span className="civicly-tagline civicly-tagline-shine" style={{ animationDelay: '0.7s' }}>
              {t('splash.taglineLine2')}
            </span>
          </h2>
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
