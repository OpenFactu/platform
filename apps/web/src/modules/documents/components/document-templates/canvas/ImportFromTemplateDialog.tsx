import { templatesApi } from '../../../api';
import React, { useEffect, useState } from 'react';
import type { TemplateRow } from '../constants';

interface Props {
  currentId?: string;
  onClose: () => void;
  onPick: (id: string) => void;
  headers: Record<string, string>;
}

/**
 * Modal para importar el canvasLayout de otra plantilla existente (misma
 * o distinta tipología). Muestra todas las plantillas del tenant y filtra
 * por nombre/tipo. Solo son seleccionables las que tengan canvasLayout
 * guardado — las "legacy HTML" se listan en gris con aviso.
 */
export const ImportFromTemplateDialog: React.FC<Props> = ({
  currentId,
  onClose,
  onPick,
  headers,
}) => {
  const [list, setList] = useState<(TemplateRow & { hasCanvas?: boolean })[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = (await templatesApi.list()) as unknown as TemplateRow[];
        // Cargamos detalle de cada una para saber si tiene canvasLayout.
        const detailed = await Promise.all(
          data
            .filter((t) => t.id !== currentId)
            .map(async (t) => {
              try {
                const d = (await templatesApi.get(t.id)) as unknown as TemplateRow & {
                  canvasLayout?: unknown;
                };
                return { ...d, hasCanvas: !!d.canvasLayout };
              } catch {
                return { ...t, hasCanvas: false };
              }
            }),
        );
        setList(detailed);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const filtered = list.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.docType.toLowerCase().includes(q);
  });

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 dark:text-slate-100">
            Importar desde otra plantilla
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <div className="p-3 border-b border-slate-200 dark:border-slate-800">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o tipo…"
            className="w-full px-3 py-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-6 text-center text-sm text-slate-400">Cargando plantillas…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-400">Sin plantillas disponibles</div>
          )}
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((t) => (
              <li
                key={t.id}
                className={`px-4 py-3 flex items-center justify-between ${
                  t.hasCanvas ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60' : 'opacity-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                    {t.name}
                  </div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span className="font-mono">{t.docType}</span>
                    {!t.hasCanvas && (
                      <span className="italic">
                        — sin canvas layout (HTML legacy, no se puede importar)
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!t.hasCanvas}
                  onClick={() => onPick(t.id)}
                  className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Importar
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
