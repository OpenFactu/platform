import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useGeo, type GeoRow } from '../../hooks/useGeo';

interface Props {
  countryCode: string;
  regionId?: string | null;
  value: string;
  onChange: (subRegionId: string) => void;
  label?: string;
  disabled?: boolean;
}

export const SubRegionSelect: React.FC<Props> = ({
  countryCode,
  regionId,
  value,
  onChange,
  label,
  disabled,
}) => {
  const { loadSubRegionsByCountry, loadSubRegionsByRegion, getCountry } = useGeo();
  const [rows, setRows] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setRows([]);
      return;
    }
    setLoading(true);
    const promise = regionId
      ? loadSubRegionsByRegion(regionId)
      : loadSubRegionsByCountry(countryCode);
    promise
      .then((data) => {
        setRows(data.filter((r) => !countryCode || r.countryCode === countryCode.toUpperCase()));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [countryCode, regionId, loadSubRegionsByCountry, loadSubRegionsByRegion]);

  const country = getCountry(countryCode);

  const options = useMemo(
    () =>
      rows.map((r) => ({
        value: r.id,
        label: r.name,
      })),
    [rows],
  );

  if (!countryCode || !country) return null;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
        {label || country.subRegionLabel}
      </label>
      <SearchableSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={
          loading ? 'Cargando...' : `Seleccionar ${country.subRegionLabel || 'provincia'}...`
        }
        disabled={disabled || loading || rows.length === 0}
      />
    </div>
  );
};
