import { useI18n } from '@/i18n/I18nContext';
import React, { useMemo } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useMembers } from '../hooks/useCrmData';

interface Props {
  value: string | null | undefined;
  onChange: (userId: string | null) => void;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
}

/** Selector de responsable entre los miembros de la empresa. */
export const OwnerSelect: React.FC<Props> = ({ value, onChange, label, disabled, placeholder }) => {
  const { t } = useI18n();
  const { members } = useMembers();
  const options = useMemo(() => members.map((m) => ({ value: m.id, label: m.name })), [members]);
  return (
    <SearchableSelect
      label={label ?? t('crm.owner.label')}
      options={options}
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      placeholder={placeholder ?? t('crm.owner.none')}
      clearable
      disabled={disabled}
    />
  );
};
