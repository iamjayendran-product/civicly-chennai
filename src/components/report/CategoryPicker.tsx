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
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {CATEGORIES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onChangeCategory(value)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
              category === value ? 'border-red-600 bg-red-50 font-medium' : 'border-gray-300'
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
          className="rounded-lg border border-gray-300 p-2 text-sm"
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
