import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect, useDebouncedValue, type Geocoder } from '@openfactu/ui';
import { geocodeApi } from '@/modules/logistics/api';
import type { GeocodeSuggestion } from '@/modules/logistics/domain/shipment';
import { useI18n } from '@/i18n/I18nContext';

/** El buscador de `TileMap`, sobre nuestro `/geocode/suggest`. */
export const logisticsGeocoder: Geocoder = async (query) => {
  const results = await geocodeApi.suggest(query);
  return (Array.isArray(results) ? results : []).map((result, index) => ({
    id: index,
    label: result.label,
    lat: result.lat,
    lng: result.lng,
  }));
};

interface Props {
  label: React.ReactNode;
  placeholder?: string;
  required?: boolean;
  value: string;
  /** Texto libre: la dirección que se teclea sin elegir una sugerencia. */
  onTextChange: (text: string) => void;
  onSelect: (suggestion: GeocodeSuggestion) => void;
}

/** Dirección de un formulario: sugerencias del servidor o el texto tal cual se escriba. */
export const AddressAutocomplete: React.FC<Props> = ({
  label,
  placeholder,
  required,
  value,
  onTextChange,
  onSelect,
}) => {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term, 250);
  const [results, setResults] = useState<GeocodeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (debounced.trim().length < 3) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    geocodeApi
      .suggest(debounced.trim())
      .then((found) => {
        if (!cancelled) setResults(Array.isArray(found) ? found : []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // La dirección actual siempre es una opción: si no, el control se vería vacío.
  const options = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(value ? [{ value, label: value }] : []),
      ...results.map((r) => ({ value: r.label, label: r.label })),
    ].filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
  }, [results, value]);

  return (
    <SearchableSelect
      label={label}
      required={required}
      placeholder={placeholder ?? t('logistics.mapSearch.placeholder')}
      options={options}
      value={value}
      clearable
      loading={loading}
      onSearchChange={setTerm}
      highlightMatch={false}
      emptyMessage={t('logistics.mapSearch.typeToSearch')}
      creatable
      createLabel={t('logistics.mapSearch.useText')}
      onCreate={(text) => {
        onTextChange(text);
        return text;
      }}
      onChange={(next) => {
        const suggestion = results.find((r) => r.label === next);
        if (suggestion) onSelect(suggestion);
        else onTextChange(next);
      }}
    />
  );
};
