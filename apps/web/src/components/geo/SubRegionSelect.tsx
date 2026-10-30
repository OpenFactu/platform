import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useGeo, type GeoRow } from '../../hooks/useGeo';
import { useI18n } from '@/i18n/I18nContext';

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
  const { t } = useI18n();
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
      <label className="text-[12px] font-medium text-fg-body">
        {label || country.subRegionLabel}
      </label>
      <SearchableSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder={
          loading
            ? t('app.geo.loading')
            : t('app.geo.selectX', { label: country.subRegionLabel || t('app.geo.province') })
        }
        disabled={disabled || loading || rows.length === 0}
      />
    </div>
  );
};
