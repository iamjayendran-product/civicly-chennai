'use client';

import { useState } from 'react';
import { t } from '@/lib/i18n';
import { validateReporterContact, type ReporterContact } from '@/lib/report/validation';

export interface ReporterContactDialogProps {
  onConfirm: (contact: ReporterContact) => void;
  onCancel: () => void;
}

export function ReporterContactDialog({ onConfirm, onCancel }: ReporterContactDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [touched, setTouched] = useState(false);

  const errors = validateReporterContact({ name, phone });

  function handleContinue() {
    setTouched(true);
    if (errors.length > 0) return;
    onConfirm({ name: name.trim(), phone: phone.trim() });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reporter-contact-title"
    >
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <h2 id="reporter-contact-title" className="text-base font-medium">
          {t('report.contact.title')}
        </h2>
        <p className="mt-1 text-xs text-gray-500">{t('report.contact.description')}</p>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('report.contact.namePlaceholder')}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
            {touched && errors.includes('NAME_REQUIRED') && (
              <p className="mt-1 text-xs text-red-600">{t('report.contact.nameRequired')}</p>
            )}
          </div>
          <div>
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder={t('report.contact.phonePlaceholder')}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
            />
            {touched && errors.includes('PHONE_INVALID') && (
              <p className="mt-1 text-xs text-red-600">{t('report.contact.phoneInvalid')}</p>
            )}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium"
          >
            {t('report.contact.cancel')}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white"
          >
            {t('report.contact.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
