'use client';

import { t } from '@/lib/i18n';
import type { Database } from '@/lib/supabase/database.types';

type Category = Database['public']['Enums']['report_category'];

const CATEGORIES: Category[] = ['pothole', 'waterlogging', 'other'];

export interface FiltersProps {
  selectedCategory: Category | null;
  onSelectCategory: (category: Category | null) => void;
  showFixed: boolean;
  onToggleShowFixed: (value: boolean) => void;
}

export function Filters({ selectedCategory, onSelectCategory, showFixed, onToggleShowFixed }: FiltersProps) {
  return (
    <div className="flex gap-2 overflow-x-auto p-3">
      <Chip active={selectedCategory === null} onClick={() => onSelectCategory(null)} label={t('map.filters.allCategories')} />
      {CATEGORIES.map((category) => (
        <Chip
          key={category}
          active={selectedCategory === category}
          onClick={() => onSelectCategory(category)}
          label={t(`report.category.${category}`)}
        />
      ))}
      <Chip active={showFixed} onClick={() => onToggleShowFixed(!showFixed)} label={t('map.filters.showFixed')} />
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${active ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-800'}`}
    >
      {label}
    </button>
  );
}
