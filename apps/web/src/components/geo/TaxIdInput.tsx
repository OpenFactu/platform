import React, { useState } from 'react';
import { Input } from '@openfactu/ui';
import { validateTaxId } from '@openfactu/common';
import { useGeo } from '../../hooks/useGeo';

interface Props {
  countryCode: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

export const TaxIdInput: React.FC<Props> = ({ countryCode, value, onChange, disabled }) => {
  const { getCountry } = useGeo();
  const country = getCountry(countryCode);
  const [touched, setTouched] = useState(false);
  const valid = value ? validateTaxId(value, country || undefined) : true;
  const showError = touched && !!value && !valid;

  return (
    <Input
      // `label` acepta ReactNode, así que el ejemplo del país va dentro.
      label={
        <>
          {country?.taxIdLabel || 'Tax ID'}
          {country?.taxIdExample && (
            <span className="text-fg-subtle ml-2 font-normal">ej: {country.taxIdExample}</span>
          )}
        </>
      }
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      onBlur={() => setTouched(true)}
      disabled={disabled}
      // `status` pinta el icono de validación como sufijo (Check / X, los mismos
      // que se dibujaban aquí a mano) y `error` implica status 'error'.
      status={touched && !!value && valid ? 'success' : 'default'}
      error={
        showError
          ? `Formato inválido para ${country?.name || countryCode}. Ejemplo: ${country?.taxIdExample}`
          : undefined
      }
    />
  );
};
