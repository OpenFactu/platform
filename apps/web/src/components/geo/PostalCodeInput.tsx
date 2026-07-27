import React, { useState } from 'react';
import { Input } from '@openfactu/ui';
import { validatePostalCode } from '@openfactu/common';
import { useGeo } from '../../hooks/useGeo';

interface Props {
  countryCode: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label?: string;
}

export const PostalCodeInput: React.FC<Props> = ({
  countryCode,
  value,
  onChange,
  disabled,
  label,
}) => {
  const { getCountry } = useGeo();
  const country = getCountry(countryCode);
  const [touched, setTouched] = useState(false);
  const valid = value ? validatePostalCode(value, country || undefined) : true;
  const showError = touched && !!value && !valid;

  return (
    <Input
      label={label || country?.postalCodeLabel || 'Código postal'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setTouched(true)}
      disabled={disabled}
      // `status` pinta el icono de validación como sufijo (Check / X, los mismos
      // que se dibujaban aquí a mano) y `error` implica status 'error'.
      status={touched && !!value && valid ? 'success' : 'default'}
      error={showError ? 'Formato inválido.' : undefined}
    />
  );
};
