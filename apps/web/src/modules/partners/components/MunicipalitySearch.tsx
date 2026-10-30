import { useI18n } from '@/i18n/I18nContext';
import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@openfactu/ui';
import { Check, Search } from 'lucide-react';
import type { GeoRow } from '@/hooks/useGeo';

interface Props {
  subRegionId: string;
  value: string;
  valueName?: string;
  onChange: (locality: GeoRow | null) => void;
  label?: string;
  disabled?: boolean;
  onSearch: (subRegionId: string, query: string) => Promise<GeoRow[]>;
}

/** Autocompletado de municipio con búsqueda remota (SearchableSelect no la soporta). */
export const MunicipalitySearch: React.FC<Props> = ({
  subRegionId,
  value,
  valueName,
  onChange,
  label,
  disabled,
  onSearch,
}) => {
  const { t } = useI18n();
  const [query, setQuery] = useState(valueName || '');
  const [results, setResults] = useState<GeoRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Si el valor cambia desde fuera (otra provincia, recarga), el texto le sigue.
  const [seenName, setSeenName] = useState(valueName);
  if (valueName !== seenName) {
    setSeenName(valueName);
    setQuery(valueName || '');
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const searching = !!subRegionId && query.trim().length >= 1;
  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await onSearch(subRegionId, query);
        if (!cancelled) setResults(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searching, subRegionId, query, onSearch]);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        label={label}
        type="text"
        value={query}
        disabled={disabled || !subRegionId}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={
          subRegionId
            ? t('partners.municipality.search')
            : t('partners.municipality.chooseProvince')
        }
        leftIcon={<Search size={14} />}
      />
      {open && searching && (
        <div className="absolute left-0 right-0 top-full z-[100999] bg-bg-card border border-border-default shadow-lg max-h-52 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-fg-subtle italic">
              {t('partners.municipality.searching')}
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-fg-subtle italic">
              {t('partners.municipality.noResults')}
            </div>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(r);
                      setQuery(r.name);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center justify-between text-fg-body"
                  >
                    <span>{r.name}</span>
                    {r.id === value && <Check size={14} className="text-accent" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
