/**
 * Renderiza el resultado de una tool del chat de IA como un componente real
 * en vez de JSON crudo — una tabla de verdad para listados de filas, un
 * mini-preview de barras para propose_dashboard_widget, cabecera+líneas para
 * get_document, o JSON legible como último recurso.
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';

type Row = Record<string, unknown>;

function isRowArray(v: unknown): v is Row[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))
  );
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string');
}

const ErrorNotice: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex items-start gap-2 text-[11px] text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-md px-2 py-1.5">
    <AlertCircle size={13} className="mt-0.5 shrink-0" />
    <span className="break-words">{message}</span>
  </div>
);

const EmptyNotice: React.FC = () => (
  <p className="text-[11px] text-slate-400 italic">Sin resultados</p>
);

function fmtCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const tableCls =
  'text-xs border-collapse w-full [&_th]:border [&_td]:border [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-600 dark:[&_td]:border-slate-600 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:font-bold [&_th]:text-left [&_th]:whitespace-nowrap';

const DataTable: React.FC<{ rows: Row[]; maxRows?: number }> = ({ rows, maxRows = 20 }) => {
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const shown = rows.slice(0, maxRows);
  return (
    <div className="overflow-x-auto custom-scrollbar max-h-72 rounded border border-border-default">
      <table className={tableCls}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i} className="bg-bg-card">
              {columns.map((c) => (
                <td key={c} className="text-fg-body">
                  {fmtCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <div className="text-[10px] text-slate-400 px-2 py-1 bg-bg-muted">
          Mostrando {maxRows} de {rows.length} filas
        </div>
      )}
    </div>
  );
};

const MiniBarChart: React.FC<{ rows: Array<{ x: unknown; y: unknown }> }> = ({ rows }) => {
  const max = Math.max(1, ...rows.map((r) => Number(r.y) || 0));
  return (
    <div className="space-y-1 py-1">
      {rows.slice(0, 12).map((r, i) => {
        const val = Number(r.y) || 0;
        const pct = Math.max(2, Math.round((val / max) * 100));
        return (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-24 truncate text-fg-muted shrink-0">{String(r.x)}</span>
            <div className="flex-1 h-3 bg-bg-muted rounded overflow-hidden">
              <div className="h-full bg-emerald-500 rounded" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-10 text-right text-fg-body tabular-nums shrink-0">{val}</span>
          </div>
        );
      })}
    </div>
  );
};

export const ToolResultView: React.FC<{ output: unknown }> = ({ output }) => {
  if (output === null || output === undefined) return null;

  const obj =
    typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : null;

  // Cualquier tool que devuelva { error: "..." } (run_read_query, propose_dashboard_widget...)
  if (obj && typeof obj.error === 'string') {
    return <ErrorNotice message={obj.error} />;
  }

  // run_read_query → { rowCount, rows: [...] } | { rowCount: 0, rows: [] }
  if (obj && Array.isArray(obj.rows)) {
    return isRowArray(obj.rows) ? <DataTable rows={obj.rows} /> : <EmptyNotice />;
  }

  // propose_dashboard_widget → { preview: { chartType, ... } }
  const preview =
    obj && typeof obj.preview === 'object' && obj.preview !== null
      ? (obj.preview as Record<string, unknown>)
      : null;
  if (preview?.chartType === 'bar' && Array.isArray(preview.rows)) {
    return <MiniBarChart rows={preview.rows as Array<{ x: unknown; y: unknown }>} />;
  }
  if (preview?.chartType === 'table' && isRowArray(preview.rows)) {
    return <DataTable rows={preview.rows} />;
  }
  if (preview?.chartType === 'kpi') {
    return (
      <p className="text-xl font-black text-fg-default tabular-nums py-1">
        {fmtCell(preview.value)}
      </p>
    );
  }

  // get_document → { header, lines }
  if (obj && 'header' in obj && 'lines' in obj && typeof obj.header === 'object' && obj.header) {
    const header = obj.header as Row;
    const lines = obj.lines;
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {Object.entries(header).map(([k, v]) => (
            <React.Fragment key={k}>
              <span className="text-slate-400">{k}</span>
              <span className="text-fg-body truncate">{fmtCell(v)}</span>
            </React.Fragment>
          ))}
        </div>
        {isRowArray(lines) && <DataTable rows={lines} />}
      </div>
    );
  }

  // Array plano de filas (search_partners, search_items, list_documents...)
  if (isRowArray(output)) {
    return <DataTable rows={output} />;
  }
  if (Array.isArray(output) && output.length === 0) {
    return <EmptyNotice />;
  }

  // list_tables → nombres cortos: chips envueltos, no un JSON vertical gigante.
  if (isStringArray(output) && output.every((s) => s.length <= 40)) {
    return (
      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto custom-scrollbar py-0.5">
        {output.map((s) => (
          <span
            key={s}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-muted text-fg-body"
          >
            {s}
          </span>
        ))}
      </div>
    );
  }

  // get_table_columns → una definición larga por tabla: un bloque mono por línea.
  if (isStringArray(output)) {
    return (
      <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar">
        {output.map((s, i) => (
          <pre
            key={i}
            className="text-[11px] font-mono text-fg-body whitespace-pre-wrap break-all bg-bg-muted rounded p-1.5"
          >
            {s}
          </pre>
        ))}
      </div>
    );
  }

  // Fallback: JSON legible
  return (
    <pre className="text-[11px] text-fg-muted whitespace-pre-wrap break-all max-h-56 overflow-y-auto custom-scrollbar bg-bg-muted rounded p-2">
      {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
    </pre>
  );
};
