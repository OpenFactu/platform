/**
 * Modal para GENERAR (sacar) un documento FREE/LABEL: carga la plantilla, detecta
 * sus parámetros de entrada (placeholders de las queries + metadata de
 * `paramsSchema`), muestra un formulario, y llama a `render-free` con esos params.
 *
 * Reutiliza el patrón de `LabelPrintButton`: POST a render-free → blob → abrir PDF
 * en pestaña nueva (fallback descarga).
 */
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import type { CanvasLayout, ParamDef } from './canvas/types';
import { resolveInputParams } from './canvas/params';
import { templatesApi } from '../api';

interface Props {
  templateId: string;
  templateName: string;
  onClose: () => void;
}

interface QueryError {
  name: string;
  error: string;
}

interface Opt {
  value: string;
  label: string;
}

/** Parsea opciones manuales: cada string es `valor` o `valor|etiqueta`. */
function parseManualOptions(options?: string[]): Opt[] {
  return (options ?? []).map((o) => {
    const i = o.indexOf('|');
    return i >= 0
      ? { value: o.slice(0, i).trim(), label: o.slice(i + 1).trim() }
      : { value: o, label: o };
  });
}

export const DocumentGeneratorModal: React.FC<Props> = ({ templateId, templateName, onClose }) => {
  const { token, user } = useAuth();
  const tenantId = user?.tenantId;
  const headers = {
    Authorization: `Bearer ${token ?? ''}`,
    'x-tenant-id': tenantId ?? '',
  };

  const [paramDefs, setParamDefs] = useState<ParamDef[] | null>(null);
  const [values, setValues] = useState<Record<string, string | string[]>>({});
  const [optionsMap, setOptionsMap] = useState<Record<string, Opt[]>>({});
  const [copies, setCopies] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<QueryError[]>([]);
  const [generating, setGenerating] = useState(false);

  // Carga la plantilla y resuelve sus parámetros de entrada.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const full = (await templatesApi.get(templateId)) as {
          canvasLayout?: CanvasLayout | null;
        };
        if (cancelled) return;
        const layout = (full.canvasLayout as CanvasLayout) ?? null;
        const defs = layout ? resolveInputParams(layout) : [];
        setParamDefs(defs);
        // Valores iniciales: default del schema o el testParam guardado.
        const initial: Record<string, string | string[]> = {};
        for (const p of defs) {
          if (p.type === 'multiselect') {
            initial[p.name] = p.default
              ? p.default
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          } else {
            const fromTest = (layout?.testParams as any)?.[p.name];
            initial[p.name] = p.default ?? (fromTest != null ? String(fromTest) : '');
          }
        }
        setValues(initial);
        // Opciones de los parámetros tipo lista: de su consulta (lookup) o manuales.
        const optMap: Record<string, Opt[]> = {};
        await Promise.all(
          defs
            .filter((p) => p.type === 'select' || p.type === 'multiselect')
            .map(async (p) => {
              if (p.optionsQuery) {
                try {
                  const b = await templatesApi.paramOptions(templateId, p.name);
                  optMap[p.name] = Array.isArray(b.options) ? (b.options as any[]) : [];
                } catch {
                  optMap[p.name] = [];
                }
              } else {
                optMap[p.name] = parseManualOptions(p.options);
              }
            }),
        );
        if (!cancelled) setOptionsMap(optMap);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'No se pudo cargar la plantilla');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const setVal = (name: string, v: string) => setValues((prev) => ({ ...prev, [name]: v }));
  const toggleMulti = (name: string, value: string) =>
    setValues((prev) => {
      const arr = Array.isArray(prev[name]) ? (prev[name] as string[]) : [];
      return {
        ...prev,
        [name]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value],
      };
    });

  const isEmpty = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim();

  const generate = async () => {
    if (!paramDefs) return;
    // Validación de obligatorios.
    const missing = paramDefs.filter((p) => p.required && isEmpty(values[p.name]));
    if (missing.length > 0) {
      setError(`Falta rellenar: ${missing.map((p) => p.label ?? p.name).join(', ')}`);
      return;
    }
    setError(null);
    setWarnings([]);
    setGenerating(true);
    try {
      // Construye el objeto de params con el tipo adecuado: array para multiselect
      // (se expande a IN), número/cadena para el resto, o null si está vacío.
      const params: Record<string, unknown> = {};
      for (const p of paramDefs) {
        const v = values[p.name];
        if (p.type === 'multiselect') {
          params[p.name] = Array.isArray(v) ? v : [];
        } else {
          const raw = String(v ?? '').trim();
          params[p.name] = raw === '' ? null : p.type === 'number' ? Number(raw) : raw;
        }
      }
      const { blob, headers: resHeaders } = await templatesApi.renderFreePdf(templateId, {
        params,
        copies,
      });
      // Avisos de queries fallidas (cabecera base64 con JSON).
      const errHeader = resHeaders.get('X-Render-Free-Errors');
      let queryErrors: QueryError[] = [];
      if (errHeader) {
        try {
          queryErrors = JSON.parse(atob(errHeader));
        } catch {
          /* ignore */
        }
      }
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${templateName.replace(/\s+/g, '_')}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      // Si hubo errores de query, los mostramos y dejamos el modal abierto.
      if (queryErrors.length > 0) {
        setWarnings(queryErrors);
      } else {
        onClose();
      }
    } catch (e: any) {
      setError(e?.message || 'Error al generar el documento');
    } finally {
      setGenerating(false);
    }
  };

  const inputCls =
    'mt-1 w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm';

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <FileDown size={16} className="text-slate-500" />
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Generar: {templateName}
          </div>
        </div>
        <div className="p-4 space-y-3 text-sm overflow-y-auto">
          {!paramDefs && !loadError && <div className="text-slate-400 italic">Cargando…</div>}
          {loadError && <div className="text-red-500 text-xs">⚠ {loadError}</div>}
          {paramDefs && paramDefs.length === 0 && (
            <div className="text-slate-500 dark:text-slate-400 text-xs">
              Esta plantilla no tiene parámetros de entrada. Pulsa “Generar PDF”.
            </div>
          )}
          {paramDefs?.map((p) => (
            <div key={p.name}>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {p.label ?? p.name}
                {p.required && <span className="text-rose-500"> *</span>}
              </label>
              {p.type === 'select' ? (
                <select
                  value={(values[p.name] as string) ?? ''}
                  onChange={(e) => setVal(p.name, e.target.value)}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {(optionsMap[p.name] ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : p.type === 'multiselect' ? (
                (optionsMap[p.name] ?? []).length > 0 ? (
                  <div className="mt-1 max-h-40 overflow-y-auto rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                    {(optionsMap[p.name] ?? []).map((o) => {
                      const arr = (values[p.name] as string[]) ?? [];
                      return (
                        <label
                          key={o.value}
                          className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                        >
                          <input
                            type="checkbox"
                            checked={arr.includes(o.value)}
                            onChange={() => toggleMulti(p.name, o.value)}
                          />
                          <span className="truncate">{o.label}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <input
                    value={
                      Array.isArray(values[p.name]) ? (values[p.name] as string[]).join(', ') : ''
                    }
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [p.name]: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder="varios valores separados por comas"
                    className={inputCls}
                  />
                )
              ) : (
                <input
                  type={p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : 'text'}
                  value={(values[p.name] as string) ?? ''}
                  onChange={(e) => setVal(p.name, e.target.value)}
                  placeholder={p.name}
                  className={inputCls}
                />
              )}
            </div>
          ))}
          {paramDefs && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Copias
              </label>
              <input
                type="number"
                min={1}
                max={200}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="mt-1 w-24 px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
              />
            </div>
          )}
          {error && <div className="text-red-500 text-xs whitespace-pre-wrap">⚠ {error}</div>}
          {warnings.length > 0 && (
            <div className="text-amber-600 dark:text-amber-400 text-xs space-y-1">
              <div className="font-semibold">PDF generado, pero algunas consultas fallaron:</div>
              {warnings.map((w, i) => (
                <div key={i} className="font-mono">
                  • {w.name}: {w.error}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {warnings.length > 0 ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={generate}
            disabled={!paramDefs || generating}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 inline-flex items-center gap-1"
          >
            <FileDown size={13} />
            {generating ? 'Generando…' : 'Generar PDF'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
