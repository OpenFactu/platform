import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
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
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
        {label || country?.postalCodeLabel || 'Código postal'}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          className={`w-full rounded-[2px] border bg-white dark:bg-slate-900 text-[13px] text-slate-900 dark:text-slate-100 px-3 py-2 pr-9 transition-colors ${
            showError
              ? 'border-rose-500 dark:border-rose-500/50'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        />
        {touched && value && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {valid ? (
              <Check size={14} className="text-emerald-500" />
            ) : (
              <X size={14} className="text-rose-500" />
            )}
          </div>
        )}
      </div>
      {showError && (
        <p className="text-[11px] text-rose-500 mt-0.5">Formato inválido.</p>
      )}
    </div>
  );
};
