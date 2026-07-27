import React, { useMemo } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useGeo } from '../../hooks/useGeo';

const FLAGS: Record<string, string> = {
  ES: '\u{1F1EA}\u{1F1F8}',
  PT: '\u{1F1F5}\u{1F1F9}',
  FR: '\u{1F1EB}\u{1F1F7}',
  IT: '\u{1F1EE}\u{1F1F9}',
  DE: '\u{1F1E9}\u{1F1EA}',
  GB: '\u{1F1EC}\u{1F1E7}',
  US: '\u{1F1FA}\u{1F1F8}',
};

interface Props {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  label?: string;
}

export const CountrySelect: React.FC<Props> = ({ value, onChange, disabled, label }) => {
  const { countries } = useGeo();

  const options = useMemo(
    () =>
      countries.map((c) => ({
        value: c.code,
        label: `${FLAGS[c.code] || ''} ${c.name}`,
      })),
    [countries],
  );

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-[12px] font-medium text-fg-body">{label || 'País'}</label>
      <SearchableSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Seleccionar país..."
        disabled={disabled}
      />
    </div>
  );
};
