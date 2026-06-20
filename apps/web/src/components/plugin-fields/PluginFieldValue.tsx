import React from 'react';
import type { PluginFieldDef } from './types';

interface Fmt {
  money?: (v: number | string | null | undefined) => string;
  number?: (v: number | string | null | undefined, precision?: number) => string;
  date?: (v: string | Date | null | undefined) => string;
}

interface Props {
  def: PluginFieldDef;
  value: any;
  fmt?: Fmt;
}

/** Render read-only de un valor de campo plugin. Uso: listados, detalles, PDF. */
export const PluginFieldValue: React.FC<Props> = ({ def, value, fmt }) => {
  if (value === null || value === undefined || value === '') {
    return <span className="text-slate-300 dark:text-slate-600">—</span>;
  }

  switch (def.fieldType) {
    case 'BOOLEAN':
      return (
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
          {value === true || value === 'true' ? 'Sí' : 'No'}
        </span>
      );

    case 'ENUM': {
      const opt = (def.options ?? []).find((o) => o.value === value);
      return <span className="text-xs text-slate-700 dark:text-slate-200">{opt?.label ?? String(value)}</span>;
    }

    case 'MULTISELECT': {
      const arr = Array.isArray(value) ? value : [];
      const opts = def.options ?? [];
      return (
        <div className="flex flex-wrap gap-1">
          {arr.map((v: string) => {
            const o = opts.find((x) => x.value === v);
            return (
              <span
                key={v}
                className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded"
              >
                {o?.label ?? v}
              </span>
            );
          })}
        </div>
      );
    }

    case 'URL':
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 hover:underline break-all"
        >
          {String(value)}
        </a>
      );

    case 'EMAIL':
      return (
        <a href={`mailto:${value}`} className="text-xs text-blue-600 hover:underline">
          {String(value)}
        </a>
      );

    case 'PHONE':
      return (
        <a href={`tel:${String(value).replace(/\s/g, '')}`} className="text-xs text-slate-700 dark:text-slate-200">
          {String(value)}
        </a>
      );

    case 'COLOR':
      return (
        <span className="inline-flex items-center gap-2 text-xs">
          <span
            className="w-4 h-4 rounded border border-slate-200 dark:border-slate-700"
            style={{ background: String(value) }}
          />
          <span className="font-mono">{String(value)}</span>
        </span>
      );

    case 'DATE':
      return <span className="text-xs text-slate-700 dark:text-slate-200">{fmt?.date?.(value) ?? String(value)}</span>;

    case 'CURRENCY':
      return (
        <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
          {fmt?.money?.(value) ?? String(value)}
        </span>
      );

    case 'PERCENT':
      return (
        <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
          {fmt?.number?.(value, 2) ?? String(value)}%
        </span>
      );

    case 'INTEGER':
      return (
        <span className="tabular-nums text-slate-700 dark:text-slate-200">{String(value)}</span>
      );

    case 'DECIMAL':
      return (
        <span className="tabular-nums text-slate-700 dark:text-slate-200">
          {fmt?.number?.(value, 4) ?? String(value)}
        </span>
      );

    case 'JSONB':
      return (
        <code className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate block max-w-xs">
          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
        </code>
      );

    case 'REFERENCE':
      // Sin caché de etiquetas aquí; mostramos el id crudo. Para resolver
      // a label se puede hacer una lookup explícita en la página.
      return (
        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
          {String(value).slice(0, 8)}…
        </span>
      );

    default:
      return <span className="text-xs text-slate-700 dark:text-slate-200">{String(value)}</span>;
  }
};
