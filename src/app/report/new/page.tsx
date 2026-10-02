'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CategoryPicker } from '@/components/report/CategoryPicker';
import { PhotoCapture, type CapturedPhoto } from '@/components/report/PhotoCapture';
import { LocationPicker } from '@/components/report/LocationPicker';
import { ReportStepContact } from '@/components/report/ReportStepContact';
import { DuplicateList } from '@/components/report/DuplicateList';
import {
  validateReportDraft,
  validateReporterContact,
  type ReportCategory,
  type ReportSubtype,
} from '@/lib/report/validation';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useSession } from '@/components/auth/SessionProvider';
import { t, errorCodeToMessage } from '@/lib/i18n';

const DEFAULT_INDEX_PANE_PERCENT = 25;
const MIN_INDEX_PANE_PERCENT = 15;
const MAX_INDEX_PANE_PERCENT = 60;
// Mobile: the map's share of the screen height. The form panel gets the rest.
const DEFAULT_MAP_HEIGHT_PERCENT = 75;
const MIN_MAP_HEIGHT_PERCENT = 30;
const MAX_MAP_HEIGHT_PERCENT = 88;

// The drag-to-resize divider only makes sense once the lg: side-by-side layout is
// active — inline widths would otherwise fight the mobile single-column flow, since
// inline styles apply regardless of Tailwind's responsive classes.
function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const syncMatch = () => setIsLarge(query.matches);
    // Deferred a tick rather than called synchronously here, to satisfy the
    // react-hooks rule against setState directly in an effect body — this still
    // corrects the initial value right after mount, same as the 'change' listener
    // does for later changes, just one microtask later (imperceptible).
    const timeoutId = setTimeout(syncMatch, 0);
    query.addEventListener('change', syncMatch);
    return () => {
      clearTimeout(timeoutId);
      query.removeEventListener('change', syncMatch);
    };
  }, []);
  return isLarge;
}

export default function NewReportPage() {
  const { userId, loading: sessionLoading, error: sessionError } = useSession();
  const [category, setCategory] = useState<ReportCategory>('pothole');
  const [subtype, setSubtype] = useState<ReportSubtype | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [confirmedNotDuplicate, setConfirmedNotDuplicate] = useState(false);
  const [reporterName, setReporterName] = useState('');
  const [reporterPhone, setReporterPhone] = useState('');
  // Below lg the form is two steps in a fixed bottom panel; at lg+ every field shows at once.
  const [step, setStep] = useState<'details' | 'duplicates' | 'contact'>('details');
  const [showStepErrors, setShowStepErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedReportId, setSubmittedReportId] = useState<string | null>(null);
  const isLargeScreen = useIsLargeScreen();
  const [indexPanePercent, setIndexPanePercent] = useState(DEFAULT_INDEX_PANE_PERCENT);
  const [mapHeightPercent, setMapHeightPercent] = useState(DEFAULT_MAP_HEIGHT_PERCENT);
  const mainRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  function handleDividerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handleDividerPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    // Dragging the handle left grows the index pane (it's measured from the right edge).
    const percentFromRight = ((rect.right - event.clientX) / rect.width) * 100;
    setIndexPanePercent(Math.min(MAX_INDEX_PANE_PERCENT, Math.max(MIN_INDEX_PANE_PERCENT, percentFromRight)));
  }
  function handleDividerPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const clampMapHeight = (percent: number) =>
    Math.min(MAX_MAP_HEIGHT_PERCENT, Math.max(MIN_MAP_HEIGHT_PERCENT, percent));
  function handleSheetPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current || !mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    setMapHeightPercent(clampMapHeight(((event.clientY - rect.top) / rect.height) * 100));
  }
  function handleSheetKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowUp') setMapHeightPercent((p) => clampMapHeight(p - 5));
    if (event.key === 'ArrowDown') setMapHeightPercent((p) => clampMapHeight(p + 5));
  }

  const draftErrors = useMemo(
    () =>
      validateReportDraft({
        category,
        subtype,
        note,
        photoCount: photos.length,
        hasLocation: location !== null,
      }),
    [category, subtype, note, photos.length, location]
  );
  const contactErrors = useMemo(
    () => validateReporterContact({ name: reporterName, phone: reporterPhone }),
    [reporterName, reporterPhone]
  );

  function handleNext() {
    if (draftErrors.length > 0) {
      setShowStepErrors(true);
      return;
    }
    setShowStepErrors(false);
    setStep(confirmedNotDuplicate ? 'contact' : 'duplicates');
  }

  async function handleSubmit() {
    if (draftErrors.length > 0 || contactErrors.length > 0 || !location || !userId) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const supabase = getBrowserClient();
      const photoPaths = await Promise.all(
        photos.map(async (photo, index) => {
          const path = `${userId}/${crypto.randomUUID()}-${index}.jpg`;
          const { error } = await supabase.storage.from('report-photos').upload(path, photo.blob, {
            contentType: 'image/jpeg',
          });
          if (error) throw error;
          return path;
        })
      );

      // p_note/p_subtype are generated as non-nullable string/enum types because the
      // Supabase type generator doesn't surface Postgres function-argument nullability
      // (see create_report's SQL body and the `reports` table schema, both of which
      // treat these as nullable — subtype is required only when category is 'other').
      // The casts below are needed to satisfy that generated type; the value sent over
      // the wire is unchanged (`null` when there's no note/subtype).
      const { data: reportId, error } = await supabase.rpc('create_report', {
        p_category: category,
        p_subtype: (category === 'other' ? subtype : null) as ReportSubtype,
        p_note: (note || null) as string,
        p_lng: location.lng,
        p_lat: location.lat,
        p_photo_paths: photoPaths,
        p_photo_blurred: photos.map((photo) => photo.blurred),
        p_reporter_name: reporterName.trim(),
        p_reporter_phone: reporterPhone.trim(),
      });

      if (error) {
        setErrorMessage(errorCodeToMessage(error.message));
        return;
      }

      // Stay on this page and show a confirmation instead of redirecting immediately —
      // the "see your grievance reported" link below carries the new id to the map via
      // ?focus=, which MapView uses to fly to and open that pin's sheet.
      setSubmittedReportId(reportId);
    } catch (err) {
      // Swallowing this with no trace made every failure here indistinguishable —
      // network hiccups, a storage error, anything. Logging the real error means a
      // report of "something went wrong" can actually be diagnosed from devtools.
      console.error('[report submit] failed:', err);
      setErrorMessage(errorCodeToMessage(err instanceof Error ? err.message : 'UNKNOWN'));
    } finally {
      setSubmitting(false);
    }
  }

  const showDetails = isLargeScreen || step === 'details';
  const showDuplicates = isLargeScreen ? !!location && !confirmedNotDuplicate : step === 'duplicates';
  const showContact = isLargeScreen || step === 'contact';
  const homeLinkClass = 'flex w-fit items-center gap-1 text-sm font-medium text-secondary';

  return (
    <main ref={mainRef} className="flex h-dvh w-full flex-col lg:flex-row">
      {/* Mobile: 75% map on top, 25% form panel below. lg+: map beside a resizable
          index pane (defaults to 75/25 left/right), adjustable by dragging the handle. */}
      <div
        className="relative shrink-0 lg:h-full"
        style={isLargeScreen ? { width: `${100 - indexPanePercent}%` } : { height: `${mapHeightPercent}%` }}
      >
        <LocationPicker onChange={setLocation} />
      </div>
      {isLargeScreen && (
        <div
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onPointerUp={handleDividerPointerUp}
          className="hidden shrink-0 items-center justify-center lg:flex lg:h-full lg:w-3 lg:cursor-col-resize lg:touch-none lg:bg-line/40 hover:lg:bg-secondary/40"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('report.resizeHandle')}
        >
          <div className="h-10 w-1 rounded-full bg-muted" />
        </div>
      )}
      {/* Mobile-only drag handle between map and form: drag (or use the arrow keys) to
          trade map height for form height. The Home link lives here, in the panel's own
          header, so it never sits on top of the map's controls. */}
      {!isLargeScreen && (
        <div className="flex shrink-0 items-center border-t border-line bg-surface/80 px-3 backdrop-blur-xl lg:hidden">
          <Link href="/home" className={homeLinkClass}>
            <span aria-hidden="true">←</span>
            {t('nav.home')}
          </Link>
          <div
            onPointerDown={(event) => {
              draggingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={(event) => {
              draggingRef.current = false;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onKeyDown={handleSheetKeyDown}
            role="separator"
            aria-orientation="horizontal"
            aria-label={t('report.resizeHandleVertical')}
            aria-valuenow={Math.round(mapHeightPercent)}
            tabIndex={0}
            className="flex h-8 flex-1 cursor-row-resize touch-none items-center justify-center"
          >
            <div className="h-1 w-12 rounded-full bg-muted" />
          </div>
          <span className="w-12" aria-hidden="true" />
        </div>
      )}
      {/* Liquid-glass-style form panel: translucent + blurred so it reads as floating
          over the map. Scrolls internally so the page itself never scrolls. */}
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto border-line bg-surface/70 p-3 backdrop-blur-xl backdrop-saturate-150 lg:gap-4 lg:border-l lg:p-6 lg:shadow-2xl"
        style={isLargeScreen ? { width: `${indexPanePercent}%`, flex: 'none' } : undefined}
      >
        <Link href="/home" className={`${homeLinkClass} hidden lg:flex`}>
          <span aria-hidden="true">←</span>
          {t('nav.home')}
        </Link>

        {submittedReportId ? (
          <div className="flex flex-col gap-2 rounded-xl bg-surface-muted p-4">
            <p className="text-sm font-medium text-foreground">{t('report.success.title')}</p>
            <Link href={`/home?focus=${submittedReportId}`} className="text-xs text-secondary underline">
              {t('report.success.viewLink')}
            </Link>
          </div>
        ) : (
          <>
            {showDetails && (
              <>
                <CategoryPicker
                  category={category}
                  subtype={subtype}
                  onChangeCategory={(nextCategory) => {
                    setCategory(nextCategory);
                    // Keep in sync with validateReportDraft's SUBTYPE_NOT_ALLOWED rule (and the
                    // DB check constraint): subtype only makes sense for 'other'. Without this,
                    // picking a subtype under 'other' and then switching away leaves subtype set
                    // and submit permanently (and silently) disabled.
                    if (nextCategory !== 'other') setSubtype(null);
                  }}
                  onChangeSubtype={setSubtype}
                />
                {/* Side by side on mobile so step 1 fits the 25% panel without scrolling. */}
                <div className="flex gap-2 lg:flex-col-reverse lg:gap-4">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder={t('report.note.placeholder')}
                    maxLength={280}
                    className="h-14 min-w-0 flex-1 resize-none rounded-xl border border-line p-2 text-sm lg:h-20"
                  />
                  <PhotoCapture photos={photos} onChange={setPhotos} />
                </div>
              </>
            )}
            {showDuplicates && location && (
              <DuplicateList
                lng={location.lng}
                lat={location.lat}
                category={category}
                onContinue={() => {
                  setConfirmedNotDuplicate(true);
                  setStep('contact');
                }}
                onNoDuplicates={() => {
                  setConfirmedNotDuplicate(true);
                  if (!isLargeScreen) setStep('contact');
                }}
                onConfirmed={(reportId) => setSubmittedReportId(reportId)}
              />
            )}
            {showContact && (
              <ReportStepContact
                name={reporterName}
                phone={reporterPhone}
                onChangeName={setReporterName}
                onChangePhone={setReporterPhone}
              />
            )}
            {((showStepErrors && showDetails && !isLargeScreen) || isLargeScreen || step === 'contact') &&
              (draftErrors.length > 0 || contactErrors.length > 0) && (
                <ul className="flex flex-col gap-0.5 text-xs text-warning">
                  {(showDetails || isLargeScreen) && draftErrors.map((code) => <li key={code}>{t(`report.errors.${code}`)}</li>)}
                  {showContact && contactErrors.includes('NAME_REQUIRED') && <li>{t('report.contact.nameRequired')}</li>}
                  {showContact && contactErrors.includes('PHONE_INVALID') && <li>{t('report.contact.phoneInvalid')}</li>}
                </ul>
              )}
            {/* Distinct from draftErrors above: this covers the case where local validation
                passes but the anonymous session never produced a usable user id (e.g. the
                Turnstile/signInAnonymously bootstrap failed in a way that clears `loading`
                without setting `error`). Without this, Submit would show enabled-looking
                feedback state with no explanation for why handleSubmit silently no-ops. */}
            {showContact && !sessionLoading && !userId && (
              <p className="text-sm text-primary">{sessionError ?? errorCodeToMessage('AUTH_REQUIRED')}</p>
            )}
            {errorMessage && <p className="text-sm text-primary">{errorMessage}</p>}
            {!isLargeScreen && step === 'details' && (
              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl bg-primary py-2.5 text-center font-medium text-white"
              >
                {t('report.next')}
              </button>
            )}
            {showContact && (
              <div className="flex gap-2">
                {!isLargeScreen && (
                  <button
                    type="button"
                    onClick={() => setStep('details')}
                    className="rounded-xl border border-line px-4 py-2.5 text-sm font-medium"
                  >
                    {t('report.back')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={draftErrors.length > 0 || contactErrors.length > 0 || submitting || sessionLoading || !userId}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-center font-medium text-white disabled:opacity-50"
                >
                  {submitting ? t('report.submitting') : t('report.submit')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
