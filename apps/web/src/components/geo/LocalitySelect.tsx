import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useGeo, type GeoRow } from '../../hooks/useGeo';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  subRegionId: string;
  value: string;
  valueName?: string;
  onChange: (locality: GeoRow | null) => void;
  label?: string;
  disabled?: boolean;
}

export const LocalitySelect: React.FC<Props> = ({
  subRegionId,
  value,
  valueName,
  onChange,
  label,
  disabled,
}) => {
  const { searchLocalities } = useGeo();
  const { t } = useI18n();
  const [rows, setRows] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!subRegionId) {
      setRows([]);
      return;
    }
    setLoading(true);
    searchLocalities(subRegionId, '')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [subRegionId, searchLocalities]);

  const options = useMemo(
    () =>
      rows.map((r) => ({
        value: r.id,
        label: r.name,
      })),
    [rows],
  );

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label className="text-[12px] font-medium text-fg-body">
        {label || t('app.geo.locality')}
      </label>
      <SearchableSelect
        options={options}
        value={value}
        onChange={(id) => {
          const loc = rows.find((r) => r.id === id);
          onChange(loc || null);
        }}
        placeholder={
          loading
            ? t('app.geo.loading')
            : subRegionId
              ? t('app.geo.searchLocality')
              : t('app.geo.selectProvinceFirst')
        }
        disabled={disabled || !subRegionId || loading}
      />
    </div>
  );
};
