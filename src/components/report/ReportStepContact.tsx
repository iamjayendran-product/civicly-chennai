'use client';

import { t } from '@/lib/i18n';

export interface ReportStepContactProps {
  name: string;
  phone: string;
  onChangeName: (name: string) => void;
  onChangePhone: (phone: string) => void;
}

/** Second step of the report form: who to contact about the grievance. */
export function ReportStepContact({ name, phone, onChangeName, onChangePhone }: ReportStepContactProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="hidden text-sm font-medium lg:block">{t('report.contact.title')}</p>
      <div className="flex gap-2 lg:flex-col">
        <input
          type="text"
          value={name}
          onChange={(event) => onChangeName(event.target.value)}
          placeholder={t('report.contact.namePlaceholder')}
          autoComplete="name"
          className="min-w-0 flex-1 rounded-xl border border-line p-2 text-sm"
        />
        <input
          type="tel"
          value={phone}
          onChange={(event) => onChangePhone(event.target.value)}
          placeholder={t('report.contact.phonePlaceholder')}
          autoComplete="tel"
          className="min-w-0 flex-1 rounded-xl border border-line p-2 text-sm"
        />
      </div>
    </div>
  );
}
