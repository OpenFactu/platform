import { coreApi } from '@/shared/api';
import React, { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Card, Button, Table, PageHeader, useToast } from '@openfactu/ui';
import type { TableColumn } from '@openfactu/ui';
import { ArrowLeft, Download, FileText, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ExcelTools, type ExcelColumn } from '@/components/common/ExcelTools';

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
      const { blob } = await coreApi.getBlob(`${pdfEndpoint}${qs}`);
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

  /**
   * Las columnas del informe se declaran una sola vez (en formato `ExcelColumn`,
   * porque el export a Excel las necesita) y aquí se traducen a las de la
   * `Table` del paquete. Antes esta vista repintaba a mano un `<table>` con su
   * cabecera, su fila de "Cargando…" y su estado vacío; la Table ya trae los
   * tres, más ordenación por columna.
   */
  const tableColumns = useMemo<TableColumn<T>[]>(
    () =>
      columns.map((c) => ({
        id: c.key,
        header: c.label,
        sortable: true,
        sortAccessor: (r: T) => r[c.key],
        cell: (r: T) => {
          const raw = r[c.key];
          const value = c.format ? c.format(raw, r) : raw;
          return value == null || value === '' ? '—' : String(value);
        },
      })),
    [columns],
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={<FileText size={22} />}
        breadcrumbs={
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={12} className="mr-1" /> Volver
          </Button>
        }
        actions={
          <div className="flex items-center gap-2 flex-shrink-0">
            {onRefresh && (
              <Button
                type="button"
                variant="secondary"
                onClick={onRefresh}
                className="flex items-center gap-2"
              >
                <RefreshCw size={16} />
                Actualizar
              </Button>
            )}
            <ExcelTools data={rows} columns={columns} filename={filename} exportOnly />
            {pdfEndpoint && (
              <Button type="button" onClick={downloadPdf} className="flex items-center gap-2">
                <Download size={16} />
                PDF
              </Button>
            )}
          </div>
        }
      />

      {filters && <Card className="p-4">{filters}</Card>}

      <Card className="overflow-hidden" noPadding>
        <Table
          columns={tableColumns}
          data={rows}
          isLoading={loading}
          rowKey={(_r, i) => i}
          emptyMessage="Ningún registro cumple los filtros actuales."
        />
      </Card>

      {footer && <div>{footer}</div>}
    </div>
  );
}
