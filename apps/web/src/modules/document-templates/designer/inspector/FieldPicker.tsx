import React, { useMemo } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { FieldDef, FieldGroup } from '../../components/canvas/fieldRegistry';
import { fieldGroupName, fieldName } from '../fieldNames';

/** Elegir un dato por su nombre, no por su ruta. */
export const FieldPicker: React.FC<{
  value: string;
  groups: FieldGroup[];
  onPick: (field: FieldDef) => void;
}> = ({ value, groups, onPick }) => {
  const { t } = useI18n();
  const options = useMemo(() => {
    const list = groups.flatMap((group) =>
      group.fields.map((field) => ({
        value: field.path,
        label: fieldName(field.path, field.description),
        secondaryLabel: field.path,
        group: fieldGroupName(group),
      })),
    );
    // Una ruta escrita a mano que no está en el catálogo también se tiene que ver.
    return value && !list.some((o) => o.value === value)
      ? [{ value, label: value }, ...list]
      : list;
  }, [groups, value]);

  return (
    <SearchableSelect
      ariaLabel={t('templates.designer.el.linkedField')}
      options={options}
      value={value}
      placeholder={t('templates.designer.fields.search')}
      onChange={(path) => {
        const field = groups.flatMap((g) => g.fields).find((f) => f.path === path);
        if (field) onPick(field);
      }}
    />
  );
};
