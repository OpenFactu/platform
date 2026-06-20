import React from 'react';
import type { ReactNode } from 'react';
import { Card, Button, useToast } from '@openfactu/ui';
import { ArrowLeft, Download, FileText, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ExcelTools, type ExcelColumn } from '../common/ExcelTools';

interface Props<T> {
  /** Título grande arriba. */
  title: string;
  /** Descripción corta bajo el título. */
  subtitle?: string;
  /** Filtros renderizados arriba (selectores, datepickers, etc). */
  filters?: ReactNode;
  /** Datos para tabla + export Excel. */
  rows: T[];
  /** Definición de columnas (idéntica a ExcelTools para reuso de export). */
  columns: ExcelColumn<T>[];
  /** Endpoint para descargar PDF. El cliente hará GET y descargará el blob. */
  pdfEndpoint?: string;
  /** Queryparams que acompañan al endpoint PDF (mismos filtros aplicados). */
  pdfQuery?: Record<string, string | number | undefined>;
  /** Nombre base del fichero (sin extensión). */
  filename: string;
  /** Si el informe está cargando. */
  loading?: boolean;
  /** Acción extra de refrescar. */
  onRefresh?: () => void;
  /** Contenido extra a mostrar debajo de la tabla (ej. totales agregados). */
  footer?: ReactNode;
}

/**
 * Layout estándar de todos los informes. Cabecera con título + filtros +
 * botones de exportar (PDF/Excel), tabla debajo, footer opcional.
 */
export function ReportPage<T extends Record<string, any>>({
  title,
  subtitle,
  filters,
  rows,
  columns,
  pdfEndpoint,
  pdfQuery,
  filename,
  loading,
  onRefresh,
  footer,
}: Props<T>) {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const downloadPdf = async () => {
    if (!pdfEndpoint) return;
    const qs = pdfQuery
      ? '?' +
        Object.entries(pdfQuery)
          .filter(([_, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    try {
      const res = await fetch(`${pdfEndpoint}${qs}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
        },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('PDF descargado');
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar PDF');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 mb-2"
          >
            <ArrowLeft size={12} /> Volver
          </button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2 tracking-tight">
            <FileText size={22} className="text-blue-600 dark:text-blue-300" />
            {title}
          </h1>
          {subtitle && (
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {onRefresh && (
            <Button variant="secondary" onClick={onRefresh} className="flex items-center gap-2">
              <RefreshCw size={16} />
              Actualizar
            </Button>
          )}
          <ExcelTools data={rows} columns={columns} filename={filename} exportOnly />
          {pdfEndpoint && (
            <Button onClick={downloadPdf} className="flex items-center gap-2">
              <Download size={16} />
              PDF
            </Button>
          )}
        </div>
      </div>

      {filters && (
        <Card className="p-4 border-slate-100 dark:border-slate-800">{filters}</Card>
      )}

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className="px-3 py-2 text-left text-[10px] font-black uppercase tracking-wider"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="p-10 text-center text-slate-400 italic text-sm"
                  >
                    Cargando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="p-10 text-center text-slate-400 italic text-sm"
                  >
                    Sin datos para los filtros actuales
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={i}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                  >
                    {columns.map((c) => {
                      const raw = r[c.key];
                      const value = c.format ? c.format(raw, r) : raw;
                      return (
                        <td
                          key={c.key}
                          className="px-3 py-2 text-xs text-slate-700 dark:text-slate-200 tabular-nums"
                        >
                          {value == null || value === '' ? '—' : String(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {footer && <div>{footer}</div>}
    </div>
  );
}
