'use client';

import { t } from '@/lib/i18n';
import type { Database } from '@/lib/supabase/database.types';
import { AllIcon, OtherIcon, PotholeIcon, ShowFixedIcon, WaterloggingIcon } from './FilterIcons';

type Category = Database['public']['Enums']['report_category'];

const CATEGORY_ICONS: Record<Category, typeof PotholeIcon> = {
  pothole: PotholeIcon,
  waterlogging: WaterloggingIcon,
  other: OtherIcon,
};

const CATEGORIES: Category[] = ['pothole', 'waterlogging', 'other'];

export interface FiltersProps {
  selectedCategory: Category | null;
  onSelectCategory: (category: Category | null) => void;
  showFixed: boolean;
  onToggleShowFixed: (value: boolean) => void;
}

export function Filters({ selectedCategory, onSelectCategory, showFixed, onToggleShowFixed }: FiltersProps) {
  return (
    <div className="flex gap-2 overflow-x-auto py-1">
      <Chip active={selectedCategory === null} onClick={() => onSelectCategory(null)} label={t('map.filters.allCategories')} icon={AllIcon} />
      {CATEGORIES.map((category) => (
        <Chip
          key={category}
          active={selectedCategory === category}
          onClick={() => onSelectCategory(category)}
          label={t(`report.category.${category}`)}
          icon={CATEGORY_ICONS[category]}
        />
      ))}
      <Chip active={showFixed} onClick={() => onToggleShowFixed(!showFixed)} label={t('map.filters.showFixed')} icon={ShowFixedIcon} />
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-white' : 'bg-surface-muted text-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
