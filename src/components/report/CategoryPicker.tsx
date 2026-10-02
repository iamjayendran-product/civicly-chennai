'use client';

import { t } from '@/lib/i18n';
import type { ReportCategory, ReportSubtype } from '@/lib/report/validation';

const CATEGORIES: ReportCategory[] = ['pothole', 'waterlogging', 'other'];
const SUBTYPES: ReportSubtype[] = [
  'open_manhole', 'debris', 'damaged_footpath', 'dug_up_road', 'speed_breaker', 'signage', 'other',
];

export interface CategoryPickerProps {
  category: ReportCategory;
  subtype: ReportSubtype | null;
  onChangeCategory: (category: ReportCategory) => void;
  onChangeSubtype: (subtype: ReportSubtype) => void;
}

export function CategoryPicker({ category, subtype, onChangeCategory, onChangeSubtype }: CategoryPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChangeCategory(value)}
            className={`flex-1 rounded-xl border px-2 py-1.5 text-sm transition-colors ${
              category === value ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-line'
            }`}
          >
            {t(`report.category.${value}`)}
          </button>
        ))}
      </div>
      {category === 'other' && (
        <select
          value={subtype ?? ''}
          onChange={(event) => onChangeSubtype(event.target.value as ReportSubtype)}
          className="rounded-xl border border-line bg-surface p-2 text-sm"
        >
          <option value="" disabled>
            {t('report.category.other')}
          </option>
          {SUBTYPES.map((value) => (
            <option key={value} value={value}>
              {t(`report.subtype.${value}`)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
