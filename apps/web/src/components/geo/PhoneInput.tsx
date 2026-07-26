import React from 'react';
import { Input } from '@openfactu/ui';
import { useGeo } from '../../hooks/useGeo';
import { normalizePhone, stripPhonePrefix } from '@openfactu/common';

interface Props {
  countryCode: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Input de teléfono con prefijo fijo del país. El valor almacenado se normaliza
 * a "+XX <numero>" al hacer blur.
 *
 * El prefijo lo pinta el `prefix` de `Input`, que es justo para esto: un
 * complemento pegado al campo con su propio borde y fondo.
 */
export const PhoneInput: React.FC<Props> = ({ countryCode, value, onChange, disabled, label }) => {
  const { getCountry } = useGeo();
  const country = getCountry(countryCode);
  const prefix = country?.phonePrefix || '';

  // Mostrar al usuario solo la parte local
  const localValue = stripPhonePrefix(value, country || undefined);

  return (
    <Input
      type="tel"
      label={label || 'Teléfono'}
      prefix={prefix || undefined}
      value={localValue}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onChange(normalizePhone(localValue, country || undefined))}
      disabled={disabled}
    />
  );
};
