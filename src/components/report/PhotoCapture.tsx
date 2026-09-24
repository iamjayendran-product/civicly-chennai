'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/i18n';
import { processPhoto } from '@/lib/images/processPhoto';

export interface CapturedPhoto {
  blob: Blob;
  blurred: boolean;
  previewUrl: string;
}

export interface PhotoCaptureProps {
  photos: CapturedPhoto[];
  onChange: (photos: CapturedPhoto[]) => void;
  max?: number;
}

export function PhotoCapture({ photos, onChange, max = 3 }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Mirrors the `photos` prop, but updated synchronously the instant a batch commits.
  // `processPhoto` runs MediaPipe face detection and can take a noticeable moment, so a
  // user can pick a second batch while the first is still processing. Both calls would
  // otherwise read the same stale `photos` closure and the second onChange would
  // overwrite whatever the first had already committed. Committing through this ref
  // instead means the second batch is built on top of the first's result.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    const remaining = max - photosRef.current.length;
    const toProcess = files.slice(0, remaining);
    setError(null);
    const results = await Promise.allSettled(
      toProcess.map(async (file) => {
        const { blob, blurred } = await processPhoto(file);
        return { blob, blurred, previewUrl: URL.createObjectURL(blob) };
      })
    );
    const processed: CapturedPhoto[] = [];
    let hadFailure = false;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        processed.push(result.value);
      } else {
        hadFailure = true;
      }
    }
    if (hadFailure) setError(t('report.photos.processingFailed'));
    if (processed.length === 0) return;
    const next = [...photosRef.current, ...processed];
    photosRef.current = next;
    onChange(next);
  }

  function removeAt(index: number) {
    const next = photos.slice();
    const [removed] = next.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    photosRef.current = next;
    onChange(next);
  }

  return (
    <div>
      <div className="flex gap-2">
        {photos.map((photo, index) => (
          <div key={photo.previewUrl} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral local
                object URL preview; next/image doesn't apply here. */}
            <img src={photo.previewUrl} alt="" className="h-20 w-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute -right-1 -top-1 rounded-full bg-gray-900 text-xs text-white"
              aria-label={t('report.photos.remove')}
            >
              ✕
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-20 w-20 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500"
          >
            {t('report.photos.add')}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">{t('report.photos.count', { count: photos.length })}</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => {
          // `event.target.files` is a live FileList: per spec, resetting `.value` empties
          // the list of selected files in place rather than swapping in a fresh FileList,
          // so a plain `const { files } = event.target` reference goes empty the instant
          // `.value` is reset below (verified: this silently broke every photo attachment
          // after that reset was added). Snapshot into a plain File[] first.
          const selected = Array.from(event.target.files ?? []);
          // Reset immediately so the browser fires onChange again if the same file is
          // re-picked after being removed — it otherwise treats an unchanged file list as
          // a no-op change.
          event.target.value = '';
          handleFiles(selected);
        }}
      />
    </div>
  );
}
