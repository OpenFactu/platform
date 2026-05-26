import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useGeo, type GeoRow } from '../../hooks/useGeo';

interface Props {
  countryCode: string;
  value: string;
  onChange: (regionId: string) => void;
  label?: string;
  disabled?: boolean;
}

export const RegionSelect: React.FC<Props> = ({
  countryCode,
  value,
  onChange,
  label,
  disabled,
}) => {
  const { loadRegions, getCountry } = useGeo();
  const [regions, setRegions] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setRegions([]);
      return;
    }
    setLoading(true);
    loadRegions(countryCode)
      .then(setRegions)
      .catch(() => setRegions([]))
      .finally(() => setLoading(false));
  }, [countryCode, loadRegions]);

  const country = getCountry(countryCode);

  const options = useMemo(
    () =>
      regions.map((r) => ({
        value: r.id,
        label: r.name,
      })),
    [regions],
  );

  if (!country?.regionLabel) return null;
  if (!countryCode) return null;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
        {label || country.regionLabel}
      </label>
      <SearchableSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={loading ? 'Cargando...' : `Seleccionar ${country.regionLabel}...`}
        disabled={disabled || loading}
      />
    </div>
  );
};
