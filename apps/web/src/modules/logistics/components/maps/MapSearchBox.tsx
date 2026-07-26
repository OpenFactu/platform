/**
 * Caja de búsqueda flotante para mapas. Autocompleta direcciones con Photon
 * vía `/api/logistics/geocode/suggest`. Al elegir, llama `onSelect` con
 * `{ lat, lng, label }`; quien lo use decide si vuela la vista, coloca un
 * pin, etc.
 *
 * Se coloca absolutamente en la esquina superior izquierda del contenedor
 * del mapa. El contenedor padre debe tener `position: relative`.
 *
 * Excepción deliberada al barrido de @openfactu/ui: el <input> y el botón de
 * limpiar son parte de un overlay posicionado sobre el mapa (y comparten
 * estilos con el modo `inline`). Sustituirlos por `Input`/`Button` rompe el
 * posicionamiento absoluto y el hit-testing contra los gestos de MapLibre.
 */

import { geocodeApi } from '@/modules/logistics/api';
import React, { useEffect, useRef, useState } from 'react';
import { Search, X as XIcon, Loader2 } from 'lucide-react';
import type { GeocodeSuggestion as Suggestion } from '@/modules/logistics/domain/shipment';

interface Props {
  onSelect: (s: Suggestion) => void;
  /** Placeholder del input. */
  placeholder?: string;
  /** Override para el token si se usa fuera de un contexto auth. */
  authHeader?: string | null;
  tenantId?: string | null;
  className?: string;
  /** Si `true`, se renderiza en flujo (no absolute) para encajar en
   *  formularios. La lista de sugerencias sigue siendo absolute respecto
   *  al wrapper. */
  inline?: boolean;
  /** Valor controlado externo — sobreescribe el estado interno cuando
   *  cambia (útil para resetear desde el padre). */
  value?: string;
  /** Callback cuando el usuario teclea — permite al padre tener el
   *  texto libre aunque no se haya elegido una sugerencia. */
  onTextChange?: (s: string) => void;
}

export const MapSearchBox: React.FC<Props> = ({
  onSelect,
  placeholder = 'Buscar dirección…',
  authHeader,
  tenantId,
  className,
  inline,
  value,
  onTextChange,
}) => {
  const [q, setQ] = useState(value ?? '');
  // Sincroniza con el valor externo si cambia (ej. reset del formulario).
  useEffect(() => {
    if (value !== undefined && value !== q) setQ(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const [debounced, setDebounced] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce de 250ms mientras se escribe.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (debounced.length < 3) {
      setResults([]);
      return;
    }
    let aborted = false;
    setLoading(true);
    geocodeApi
      .suggest(debounced)
      .catch((err) => {
        console.error(
          `[MapSearchBox] /geocode/suggest falló. ` +
            `Cabeceras auth/tenant enviadas: auth=${!!authHeader}, tenant=${!!tenantId}`,
          err,
        );
        return [];
      })
      .then((d) => {
        if (aborted) return;
        if (Array.isArray(d) && d.length === 0 && debounced.length >= 3) {
          console.log(`[MapSearchBox] 0 resultados para "${debounced}" — revisa backend`);
        }
        setResults(Array.isArray(d) ? d : []);
        setOpen(true);
      })
      .catch((err) => {
        if (!aborted) {
          console.error('[MapSearchBox] fetch falló:', err);
          setResults([]);
        }
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [debounced, authHeader, tenantId]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (s: Suggestion) => {
    setQ(s.label);
    setOpen(false);
    onSelect(s);
  };

  const wrapperStyle: React.CSSProperties = inline
    ? { position: 'relative' }
    : {
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 10,
        width: 'calc(100% - 20px)',
        maxWidth: 380,
      };

  // En inline el dropdown se posiciona absolute respecto al wrapper para
  // no estirar el formulario; en floating queda justo bajo la caja.
  const dropdownClass = inline
    ? 'absolute left-0 right-0 mt-1 z-20 bg-white dark:bg-slate-900 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden max-h-80 overflow-y-auto'
    : 'mt-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden max-h-80 overflow-y-auto';

  const inputBoxClass = inline
    ? 'flex items-center gap-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 h-10 px-3'
    : 'flex items-center gap-2 bg-white rounded-xl shadow-lg border border-slate-200 px-3 py-2';

  return (
    <div ref={wrapperRef} style={wrapperStyle} className={className}>
      <div className={inputBoxClass}>
        <Search size={16} className="text-slate-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            onTextChange?.(v);
            if (v.length >= 3) setOpen(true);
          }}
          onFocus={() => q.length >= 3 && setOpen(true)}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm bg-transparent text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
        />
        {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
        {q && !loading && (
          <button
            onClick={() => {
              setQ('');
              setResults([]);
              setOpen(false);
              onTextChange?.('');
            }}
            className="text-slate-400 hover:text-slate-600"
            title="Limpiar"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className={dropdownClass}>
          {results.map((r, i) => (
            <li
              key={i}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0"
            >
              <div className="text-sm text-slate-800 dark:text-slate-100 leading-tight truncate">
                {r.label}
              </div>
              {(r.type || r.housenumber) && (
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {[r.type, r.housenumber ? `nº ${r.housenumber}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && !loading && debounced.length >= 3 && results.length === 0 && (
        <div className={dropdownClass + ' px-3 py-2 text-xs text-slate-500'}>
          Sin resultados para <b>{debounced}</b>
        </div>
      )}
    </div>
  );
};
