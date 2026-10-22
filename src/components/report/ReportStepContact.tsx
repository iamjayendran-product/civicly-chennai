'use client';

import { t } from '@/lib/i18n';
import type { ReporterGender } from '@/lib/report/validation';

const GENDERS: ReporterGender[] = ['male', 'female', 'transgender'];

export interface ReportStepContactProps {
  name: string;
  phone: string;
  gender: ReporterGender | null;
  onChangeName: (name: string) => void;
  onChangePhone: (phone: string) => void;
  onChangeGender: (gender: ReporterGender) => void;
}

/** Second step of the report form: who to contact about the grievance, plus the gender
 * GCC's complaint form requires. */
export function ReportStepContact({ name, phone, gender, onChangeName, onChangePhone, onChangeGender }: ReportStepContactProps) {
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
      <div role="radiogroup" aria-labelledby="report-gender-label" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span id="report-gender-label" className="text-xs font-medium text-muted">
          {t('report.contact.gender')}
        </span>
        {GENDERS.map((option) => (
          <label key={option} className="flex items-center gap-1">
            <input
              type="radio"
              name="report-gender"
              value={option}
              checked={gender === option}
              onChange={() => onChangeGender(option)}
            />
            {t(`report.contact.gender.${option}`)}
          </label>
        ))}
      </div>
    </div>
  );
}
