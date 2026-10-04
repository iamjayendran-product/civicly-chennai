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
// Once the globe has landed: line 1 fades in, then line 2 (each 0.8s, see
// `civicly-tagline-in`), then the button. CTA_DELAY_MS = line 2's start + its duration.
// All offsets start after the pin drop (`civicly-pin-drop`, 0.9s) so the text only
// appears once the whole motion sequence has played out.
const PIN_DROP_S = 0.9;
const LINE1_DELAY_S = PIN_DROP_S + 0.3;
const LINE2_DELAY_S = LINE1_DELAY_S + 0.9;
const CTA_DELAY_MS = (LINE2_DELAY_S + 0.9) * 1000;

/** The entry page at `/`: a full-screen animated screen with its own decorative map
 * (not the live homepage). Stays up until the citizen taps through to `/home`, since
 * there's no separate marketing landing page to carry that first impression. */
export function EntryGate() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  // Where the logo pin's tip sits, as a distance from the top of the screen. The map is
  // framed to put Chennai there. Re-measured whenever the screen changes size (address
  // bar collapsing, rotating, resizing a window, web fonts finishing) so it can't go
  // stale; the map pin itself lives inside the logo's box, so it follows the logo by
  // construction and never needs coordinates.
  const [focalY, setFocalY] = useState<number | null>(null);
  const [pinSrc, setPinSrc] = useState<string | null>(null);
  const [ctaVisible, setCtaVisible] = useState(false);
  // The tagline and button stay hidden until the map has finished its fly-in.
  const landed = pinSrc !== null;

  useEffect(() => {
    if (!landed) return;
    const timer = setTimeout(() => setCtaVisible(true), CTA_DELAY_MS);
    return () => clearTimeout(timer);
  }, [landed]);

  useEffect(() => {
    let cancelled = false;
    let fontsReady = false;
    function measure() {
      const rect = markRef.current?.getBoundingClientRect();
      if (!rect || cancelled || !fontsReady) return;
      // The pin's tip is ~92% of the way down the logo's own box.
      const next = Math.round(rect.top + rect.height * 0.92);
      setFocalY((prev) => (prev === next ? prev : next));
    }
    // Wait for web fonts (capped at 1s): they reflow the text, which moves the logo.
    const fonts = document.fonts?.ready ?? Promise.resolve();
    Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 1000))]).then(() => {
      fontsReady = true;
      measure();
    });
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    if (markRef.current) observer.observe(markRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  function enter() {
    setLeaving(true);
    router.prefetch('/home');
    setTimeout(() => router.push('/home'), FADE_MS);
  }

  return (
    <div
      ref={rootRef}
      className={`fixed inset-0 z-50 overflow-hidden bg-black transition-opacity duration-[400ms] ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {focalY !== null && <GateBackgroundMap focalY={focalY} onSettled={() => setPinSrc(reportPinDataUrl('pothole', 'open'))} />}
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
      <p className="absolute bottom-3 left-0 right-0 z-20 text-center text-[10px] text-muted">{t('splash.imageryCredit')}</p>
      <div className="relative z-20 flex h-full flex-col items-center justify-center gap-8 [@media(max-height:620px)]:gap-4">
        <div className="flex flex-col items-center gap-5 [@media(max-height:620px)]:gap-2">
          <div className="relative flex h-36 w-36 items-center justify-center [@media(max-height:620px)]:h-24 [@media(max-height:620px)]:w-24">
            <span className="absolute inset-3 animate-pulse rounded-full bg-secondary/25 blur-md" />
            {/* The logo and Chennai's map pin share this one box, sized responsively. The
                pin sits just inside the logo (inset 6%) and behind it, so at rest only
                one pin is ever visible, wherever the box ends up on the screen. */}
            <div ref={markRef} className="relative h-16 w-16 [@media(max-height:620px)]:h-12 [@media(max-height:620px)]:w-12">
              {pinSrc && (
                // eslint-disable-next-line @next/next/no-img-element -- generated data URL.
                <img src={pinSrc} alt="" className="civicly-pin-drop pointer-events-none absolute inset-[6%] h-[88%] w-[88%]" />
              )}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="civicly-heartbeat absolute inset-0 h-full w-full text-primary drop-shadow-[0_0_18px_rgba(255,69,58,0.65)]"
                aria-hidden="true"
              >
                <path
                  d="M12 2c-4.4 0-8 3.6-8 8 0 5.4 6.6 11.4 7.3 12a1 1 0 0 0 1.4 0c.7-.6 7.3-6.6 7.3-12 0-4.4-3.6-8-8-8z"
                  fill="currentColor"
                />
                <circle cx="12" cy="10" r="3" fill="black" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('splash.title')}</h1>
          {/* Always rendered (never gated on later state) so the logo's measured position,
              which the globe pin is aligned to, doesn't shift after mount. */}
          <h2 className="-mt-2 flex flex-col items-center text-center text-4xl font-black [@media(max-height:620px)]:text-3xl uppercase leading-[1.05] tracking-tight">
            <span
              className={landed ? 'civicly-tagline text-foreground' : 'block opacity-0'}
              style={{ animationDelay: `${LINE1_DELAY_S}s` }}
            >
              {t('splash.taglineLine1')}
            </span>
            <span
              className={landed ? 'civicly-tagline civicly-tagline-shine' : 'block opacity-0'}
              style={{ animationDelay: `${LINE2_DELAY_S}s, ${LINE2_DELAY_S + 0.9}s` }}
            >
              {t('splash.taglineLine2')}
            </span>
          </h2>
        </div>
        <button
          type="button"
          onClick={enter}
          tabIndex={ctaVisible ? 0 : -1}
          aria-hidden={!ctaVisible}
          // Always laid out (just transparent) so the logo, which the globe pin is aligned
          // to, doesn't shift when the button appears.
          className={`rounded-full bg-primary px-6 py-3 text-base font-semibold text-white shadow-[0_0_24px_rgba(255,69,58,0.5)] transition-[opacity,transform] duration-700 active:scale-95 ${
            ctaVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          {t('splash.cta')}
        </button>
      </div>
    </div>
  );
}
