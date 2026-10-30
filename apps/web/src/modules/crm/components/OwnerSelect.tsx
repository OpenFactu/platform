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
export const OwnerSelect: React.FC<Props> = ({
  value,
  onChange,
  label = 'Responsable',
  disabled,
  placeholder = '— sin responsable —',
}) => {
  const { members } = useMembers();
  const options = useMemo(() => members.map((m) => ({ value: m.id, label: m.name })), [members]);
  return (
    <SearchableSelect
      label={label}
      options={options}
      value={value ?? ''}
      onChange={(v) => onChange(v || null)}
      placeholder={placeholder}
      clearable
      disabled={disabled}
    />
  );
};
