/**
 * Modal para GENERAR (sacar) un documento FREE/LABEL: carga la plantilla, detecta
 * sus parámetros de entrada (placeholders de las queries + metadata de
 * `paramsSchema`), muestra un formulario, y llama a `render-free` con esos params.
 *
 * Reutiliza el patrón de `LabelPrintButton`: POST a render-free → blob → abrir PDF
 * en pestaña nueva (fallback descarga).
 */
import React, { useEffect, useState } from 'react';
import { Modal, Button, Input, Select, NumberInput, DatePicker, Checkbox } from '@openfactu/ui';
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
      } catch (e) {
        if (!cancelled)
          setLoadError(
            (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
              'No se pudo cargar la plantilla',
          );
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
    } catch (e) {
      setError(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          'Error al generar el documento',
      );
    } finally {
      setGenerating(false);
    }
  };

  /* Etiqueta en versales de los parámetros. Ni Checkbox ni SearchableSelect
     exponen `label`, y el multiselect es una lista propia, así que se mantiene
     a mano para que los tres tipos de campo se vean igual. */
  const ParamLabel: React.FC<{ p: ParamDef }> = ({ p }) => (
    <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider">
      {p.label ?? p.name}
      {p.required && <span className="text-danger"> *</span>}
    </label>
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Generar: ${templateName}`}
      size="sm"
      closeOnOverlayClick
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {warnings.length > 0 ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={generate}
            disabled={!paramDefs}
            isLoading={generating}
          >
            <FileDown size={13} />
            {generating ? 'Generando…' : 'Generar PDF'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        {!paramDefs && !loadError && <div className="text-fg-subtle italic">Cargando…</div>}
        {loadError && <div className="text-danger-fg text-xs">⚠ {loadError}</div>}
        {paramDefs && paramDefs.length === 0 && (
          <div className="text-fg-muted text-xs">
            Esta plantilla no tiene parámetros de entrada. Pulsa “Generar PDF”.
          </div>
        )}
        {paramDefs?.map((p) => (
          <div key={p.name} className="space-y-1">
            <ParamLabel p={p} />
            {p.type === 'select' ? (
              <Select
                value={(values[p.name] as string) ?? ''}
                onChange={(v) => setVal(p.name, v)}
                options={[
                  { value: '', label: '—' },
                  ...(optionsMap[p.name] ?? []).map((o) => ({ value: o.value, label: o.label })),
                ]}
              />
            ) : p.type === 'multiselect' ? (
              (optionsMap[p.name] ?? []).length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded border border-border-default bg-bg-card divide-y divide-border-subtle">
                  {(optionsMap[p.name] ?? []).map((o) => {
                    const arr = (values[p.name] as string[]) ?? [];
                    return (
                      <label
                        key={o.value}
                        className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-bg-hover"
                      >
                        <Checkbox
                          size="sm"
                          checked={arr.includes(o.value)}
                          onChange={() => toggleMulti(p.name, o.value)}
                        />
                        <span className="truncate">{o.label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                // Sin catálogo de opciones el parámetro se teclea a mano,
                // separando los valores por comas.
                <Input
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
                />
              )
            ) : p.type === 'number' ? (
              <NumberInput
                value={values[p.name] == null ? null : Number(values[p.name])}
                onChange={(v) => setVal(p.name, v == null ? '' : String(v))}
                placeholder={p.name}
              />
            ) : p.type === 'date' ? (
              <DatePicker
                value={(values[p.name] as string) ?? ''}
                onChange={(iso) => setVal(p.name, iso ?? '')}
              />
            ) : (
              <Input
                value={(values[p.name] as string) ?? ''}
                onChange={(e) => setVal(p.name, e.target.value)}
                placeholder={p.name}
              />
            )}
          </div>
        ))}
        {paramDefs && (
          <NumberInput
            label="Copias"
            min={1}
            max={200}
            value={copies}
            onChange={(v) => setCopies(v ?? 1)}
            containerClassName="w-24"
          />
        )}
        {error && <div className="text-danger-fg text-xs whitespace-pre-wrap">⚠ {error}</div>}
        {warnings.length > 0 && (
          <div className="text-warning-fg text-xs space-y-1">
            <div className="font-semibold">PDF generado, pero algunas consultas fallaron:</div>
            {warnings.map((w, i) => (
              <div key={i} className="font-mono">
                • {w.name}: {w.error}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
