'use client';

import { useRef } from 'react';
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

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = max - photos.length;
    const toProcess = Array.from(files).slice(0, remaining);
    const processed = await Promise.all(
      toProcess.map(async (file) => {
        const { blob, blurred } = await processPhoto(file);
        return { blob, blurred, previewUrl: URL.createObjectURL(blob) };
      })
    );
    onChange([...photos, ...processed]);
  }

  function removeAt(index: number) {
    const next = photos.slice();
    const [removed] = next.splice(index, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
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
              aria-label="Remove photo"
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
