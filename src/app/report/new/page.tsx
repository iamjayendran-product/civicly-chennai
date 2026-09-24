'use client';

import { useMemo, useState } from 'react';
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
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
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
      <LocationPicker onChange={setLocation} />
      {location && !confirmedNotDuplicate && (
        <DuplicateList lng={location.lng} lat={location.lat} category={category} onContinue={() => setConfirmedNotDuplicate(true)} />
      )}
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t('report.note.placeholder')}
        maxLength={280}
        className="rounded-lg border border-gray-300 p-2 text-sm"
      />
      {draftErrors.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-amber-700">
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
        <p className="text-sm text-red-600">{sessionError ?? errorCodeToMessage('AUTH_REQUIRED')}</p>
      )}
      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}
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
        className="rounded-lg bg-red-600 py-3 text-center font-medium text-white disabled:opacity-50"
      >
        {submitting ? t('report.submitting') : t('report.submit')}
      </button>
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
