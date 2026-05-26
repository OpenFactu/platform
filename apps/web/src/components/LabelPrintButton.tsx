/**
 * Botón + modal para imprimir etiquetas a partir de plantillas LABEL.
 *
 * Flujo:
 *  1. Lista las plantillas con docType=LABEL del tenant.
 *  2. Si hay 1 sola, imprime directamente al hacer click; si hay varias,
 *     muestra un selector dentro del modal.
 *  3. Permite indicar nº de copias y abre el PDF resultante en una pestaña
 *     nueva (responsabilidad del navegador imprimirlo).
 *
 * El componente recibe `params` (objeto plano) que se reenvía al endpoint
 * `POST /api/document-templates/:id/render-free` como placeholders SQL
 * disponibles en las queries de la plantilla — típicamente `{ itemId }`.
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Tag, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface FreeTemplate {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Props {
  /** Parámetros que se enviarán como placeholders SQL (`:itemId`, etc.). */
  params: Record<string, unknown>;
  /** Texto del tooltip / aria-label del botón. */
  title?: string;
  /** Si se le pasa, sustituye al botón estándar y se renderiza con este nodo (para usar dentro de un dropdown, etc.). */
  triggerLabel?: React.ReactNode;
  /** Variante visual: `icon` (botón compacto solo icono) o `full` (icono + texto). Por defecto `icon`. */
  variant?: 'icon' | 'full';
  /** className extra para el botón. */
  className?: string;
}

export const LabelPrintButton: React.FC<Props> = ({
  params,
  title = 'Imprimir etiqueta',
  triggerLabel,
  variant = 'icon',
  className,
}) => {
  const { token, user } = useAuth();
  const tenantId = user?.tenantId;
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<FreeTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [copies, setCopies] = useState<number>(1);
  const [printing, setPrinting] = useState(false);

  // Carga las plantillas FREE al abrir el modal por primera vez.
  useEffect(() => {
    if (!open || templates !== null) return;
    (async () => {
      try {
        const res = await fetch('/api/document-templates?docType=LABEL', {
          headers: {
            Authorization: `Bearer ${token ?? ''}`,
            'x-tenant-id': tenantId ?? '',
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list: FreeTemplate[] = await res.json();
        setTemplates(list);
        const def = list.find((t) => t.isDefault) ?? list[0];
        setSelectedId(def?.id ?? '');
      } catch (e: any) {
        setError(e?.message || 'No se pudo cargar las plantillas');
      }
    })();
  }, [open, templates, token, tenantId]);

  const doPrint = async () => {
    if (!selectedId) return;
    setPrinting(true);
    setError(null);
    try {
      const res = await fetch(`/api/document-templates/${selectedId}/render-free`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
          'x-tenant-id': tenantId ?? '',
        },
        body: JSON.stringify({ params, copies }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        // Bloqueado por popups: ofrecemos descarga directa como fallback.
        const a = document.createElement('a');
        a.href = url;
        a.download = 'etiqueta.pdf';
        a.click();
      }
      // Liberamos el blob tras un margen para que el navegador lo cargue.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || 'Error al imprimir');
    } finally {
      setPrinting(false);
    }
  };

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200';

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={title}
        className={
          className ||
          (variant === 'full'
            ? `${btnBase} px-2.5 py-1 text-xs`
            : `${btnBase} h-7 w-7 justify-center p-0`)
        }
      >
        {triggerLabel ?? (
          <>
            <Tag size={variant === 'full' ? 13 : 14} />
            {variant === 'full' && <span>Etiqueta</span>}
          </>
        )}
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <Printer size={16} className="text-slate-500" />
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Imprimir etiqueta
                </div>
              </div>
              <div className="p-4 space-y-3 text-sm">
                {!templates && !error && (
                  <div className="text-slate-400 italic">Cargando plantillas…</div>
                )}
                {templates && templates.length === 0 && (
                  <div className="text-amber-600 dark:text-amber-400">
                    No hay plantillas de tipo "Etiqueta libre". Créala desde
                    <em> Plantillas de documento</em> seleccionando ese tipo.
                  </div>
                )}
                {templates && templates.length > 0 && (
                  <>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Plantilla
                      </label>
                      <select
                        value={selectedId}
                        onChange={(e) => setSelectedId(e.target.value)}
                        className="mt-1 w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      >
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.isDefault ? ' (default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Copias
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={copies}
                        onChange={(e) =>
                          setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))
                        }
                        className="mt-1 w-24 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                      />
                    </div>
                    {Object.keys(params).length > 0 && (
                      <details className="text-[11px] text-slate-500 dark:text-slate-400">
                        <summary className="cursor-pointer">Parámetros enviados</summary>
                        <pre className="mt-1 p-2 rounded bg-slate-50 dark:bg-slate-800 overflow-auto">
                          {JSON.stringify(params, null, 2)}
                        </pre>
                      </details>
                    )}
                  </>
                )}
                {error && <div className="text-red-500 text-xs whitespace-pre-wrap">⚠ {error}</div>}
              </div>
              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={doPrint}
                  disabled={!selectedId || printing}
                  className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Printer size={13} />
                  {printing ? 'Generando…' : 'Imprimir'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
