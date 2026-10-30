import React from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

interface RouteLike {
  id: string;
  code: string;
  name?: string | null;
  plannedDate?: string | null;
  status?: string | null;
  driverName?: string | null;
}

interface RoutePickerProps {
  value: string;
  onChange: (id: string) => void;
  routes: RouteLike[];
  allowEmpty?: boolean;
  filterStatuses?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<string, string> = {
  planned: 'logistics.status.route.planned',
  active: 'logistics.status.route.active',
  completed: 'logistics.status.route.completed',
  cancelled: 'logistics.status.route.cancelled',
};

/**
 * Selector de ruta sustituto de los `<select>` planos. Muestra:
 *   [código]  fecha · driver   · estado
 * para que el operario distinga entre rutas rápidamente.
 */
export const RoutePicker: React.FC<RoutePickerProps> = ({
  value,
  onChange,
  routes,
  allowEmpty = true,
  filterStatuses,
  placeholder,
  disabled,
  className,
}) => {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t('logistics.routePicker.placeholder');
  const filtered = filterStatuses?.length
    ? routes.filter((r) => r.status && filterStatuses.includes(r.status))
    : routes;

  const options = [
    ...(allowEmpty ? [{ value: '', label: resolvedPlaceholder }] : []),
    ...filtered.map((r) => {
      const label = [r.code, r.name?.trim() || null].filter(Boolean).join(' · ');
      const secondary = [
        r.plannedDate || null,
        r.driverName || null,
        r.status ? (STATUS_LABEL[r.status] ? t(STATUS_LABEL[r.status]) : r.status) : null,
      ]
        .filter(Boolean)
        .join(' · ');
      return { value: r.id, label, secondaryLabel: secondary };
    }),
  ];

  return (
    <SearchableSelect
      options={options}
      value={value || ''}
      onChange={onChange}
      placeholder={resolvedPlaceholder}
      disabled={disabled}
      className={className}
    />
  );
};
