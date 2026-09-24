'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CategoryPicker } from '@/components/report/CategoryPicker';
import { PhotoCapture, type CapturedPhoto } from '@/components/report/PhotoCapture';
import { LocationPicker } from '@/components/report/LocationPicker';
import { DuplicateList } from '@/components/report/DuplicateList';
import { ReporterContactDialog } from '@/components/report/ReporterContactDialog';
import { validateReportDraft, type ReportCategory, type ReportSubtype, type ReporterContact } from '@/lib/report/validation';
import { getBrowserClient } from '@/lib/supabase/browser';
import { useSession } from '@/components/auth/SessionProvider';
import { t, errorCodeToMessage } from '@/lib/i18n';

const DEFAULT_INDEX_PANE_PERCENT = 25;
const MIN_INDEX_PANE_PERCENT = 15;
const MAX_INDEX_PANE_PERCENT = 60;

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
  const router = useRouter();
  const { userId, loading: sessionLoading, error: sessionError } = useSession();
  const [category, setCategory] = useState<ReportCategory>('pothole');
  const [subtype, setSubtype] = useState<ReportSubtype | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [location, setLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [confirmedNotDuplicate, setConfirmedNotDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contact, setContact] = useState<ReporterContact | null>(null);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const isLargeScreen = useIsLargeScreen();
  const [indexPanePercent, setIndexPanePercent] = useState(DEFAULT_INDEX_PANE_PERCENT);
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

  async function handleSubmit(reporterContact: ReporterContact) {
    if (draftErrors.length > 0 || !location || !userId) return;
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
      const { error } = await supabase.rpc('create_report', {
        p_category: category,
        p_subtype: (category === 'other' ? subtype : null) as ReportSubtype,
        p_note: (note || null) as string,
        p_lng: location.lng,
        p_lat: location.lat,
        p_photo_paths: photoPaths,
        p_photo_blurred: photos.map((photo) => photo.blurred),
        p_reporter_name: reporterContact.name,
        p_reporter_phone: reporterContact.phone,
      });

      if (error) {
        setErrorMessage(errorCodeToMessage(error.message));
        return;
      }

      // /r/[id] doesn't exist yet in this slice (out of scope for MVP); the map's
      // Realtime subscription picks up the new report and shows it live, which is
      // what matters for the MVP loop. Revisit once /r/[id] ships.
      router.push('/');
    } catch {
      setErrorMessage(errorCodeToMessage('UNKNOWN'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      ref={mainRef}
      className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 lg:mx-0 lg:h-dvh lg:max-w-none lg:flex-row lg:gap-0 lg:p-0"
    >
      {/* Full-height map on desktop (per src/CLAUDE.md's mobile-first note, this only
          changes layout at the lg: breakpoint — mobile keeps the original single-column
          stacked flow with the map inline like every other field). Defaults to a 75/25
          map/index split, adjustable by dragging the handle below. */}
      <div className="lg:h-full" style={isLargeScreen ? { width: `${100 - indexPanePercent}%` } : undefined}>
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
      {/* Liquid-glass-style index pane: translucent + blurred rather than a flat opaque
          panel, so it reads as floating over the map instead of a hard-edged sidebar. */}
      <div
        className="flex flex-col gap-4 border-line bg-surface/70 backdrop-blur-xl backdrop-saturate-150 lg:h-full lg:overflow-y-auto lg:border-l lg:p-6 lg:shadow-2xl"
        style={isLargeScreen ? { width: `${indexPanePercent}%` } : undefined}
      >
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
        <PhotoCapture photos={photos} onChange={setPhotos} />
        {location && !confirmedNotDuplicate && (
          <DuplicateList lng={location.lng} lat={location.lat} category={category} onContinue={() => setConfirmedNotDuplicate(true)} />
        )}
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t('report.note.placeholder')}
          maxLength={280}
          className="rounded-xl border border-line p-2 text-sm"
        />
        {draftErrors.length > 0 && (
          <ul className="flex flex-col gap-0.5 text-xs text-warning">
            {draftErrors.map((code) => (
              <li key={code}>{t(`report.errors.${code}`)}</li>
            ))}
          </ul>
        )}
        {/* Distinct from draftErrors above: this covers the case where local validation
            passes but the anonymous session never produced a usable user id (e.g. the
            Turnstile/signInAnonymously bootstrap failed in a way that clears `loading`
            without setting `error`). Without this, Submit would show enabled-looking
            feedback state with no explanation for why handleSubmit silently no-ops. */}
        {!sessionLoading && !userId && (
          <p className="text-sm text-primary">{sessionError ?? errorCodeToMessage('AUTH_REQUIRED')}</p>
        )}
        {errorMessage && <p className="text-sm text-primary">{errorMessage}</p>}
        <button
          type="button"
          onClick={() => {
            // Once collected, a contact isn't re-asked on retry (e.g. after a failed
            // submit) — only a fresh page load clears it.
            if (contact) {
              handleSubmit(contact);
            } else {
              setShowContactDialog(true);
            }
          }}
          disabled={draftErrors.length > 0 || submitting || sessionLoading || !userId}
          className="rounded-xl bg-primary py-3 text-center font-medium text-white disabled:opacity-50"
        >
          {submitting ? t('report.submitting') : t('report.submit')}
        </button>
      </div>
      {showContactDialog && (
        <ReporterContactDialog
          onConfirm={(reporterContact) => {
            setContact(reporterContact);
            setShowContactDialog(false);
            handleSubmit(reporterContact);
          }}
          onCancel={() => setShowContactDialog(false)}
        />
      )}
    </main>
  );
}
