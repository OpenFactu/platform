import React from 'react';
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
 */
export const PhoneInput: React.FC<Props> = ({ countryCode, value, onChange, disabled, label }) => {
  const { getCountry } = useGeo();
  const country = getCountry(countryCode);
  const prefix = country?.phonePrefix || '';

  // Mostrar al usuario solo la parte local
  const localValue = stripPhonePrefix(value, country || undefined);

  return (
    <div>
      <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
        {label || 'Teléfono'}
      </label>
      <div className="flex">
        {prefix && (
          <span className="inline-flex items-center px-3 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm  border-r-0">
            {prefix}
          </span>
        )}
        <input
          type="tel"
          value={localValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => onChange(normalizePhone(localValue, country || undefined))}
          disabled={disabled}
          className={`flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-sm ${prefix ? '' : ''}`}
        />
      </div>
    </div>
  );
};
