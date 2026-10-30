import React from 'react';
import { Button, Card, FileDropzone, SegmentedControl, Table, Badge } from '@openfactu/ui';
import { Download, FileSpreadsheet } from 'lucide-react';
import type { ImportObject, UploadResult, UploadedSheet } from '../types';

interface Props {
  object: ImportObject;
  upload: UploadResult | null;
  uploading: boolean;
  sheet: UploadedSheet | null;
  linesSheet: UploadedSheet | null;
  onUpload: (file: File) => void;
  onChooseSheet: (name: string) => void;
  onChooseLinesSheet: (name: string) => void;
  onDownloadTemplate: () => void;
}

export const StepFile: React.FC<Props> = ({
  object,
  upload,
  uploading,
  sheet,
  linesSheet,
  onUpload,
  onChooseSheet,
  onChooseLinesSheet,
  onDownloadTemplate,
}) => {
  const columns =
    sheet?.headers.map((h) => ({
      header: h,
      cell: (row: Record<string, unknown>) => <span className="text-xs">{formatCell(row[h])}</span>,
    })) ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <FileSpreadsheet size={20} className="text-fg-muted shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-fg-default">
              ¿No tienes el fichero preparado?
            </p>
            <p className="text-xs text-fg-muted">
              Descarga la plantilla de {object.label.toLowerCase()}: trae las columnas, una fila de
              ejemplo y una hoja con qué espera cada campo.
              {object.lines &&
                ` Las ${object.lines.label.toLowerCase()} van en su propia pestaña del mismo fichero, unidas a su cabecera por la columna "${object.lines.groupBy}".`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onDownloadTemplate} className="gap-1.5">
            <Download size={14} /> Plantilla
          </Button>
        </div>
      </Card>

      <FileDropzone
        onFiles={(files) => files[0] && onUpload(files[0])}
        accept=".xlsx,.xls,.xlsm,.csv,.tsv,.txt"
        maxSizeMb={25}
        maxFiles={1}
        isUploading={uploading}
        uploadingLabel="Leyendo el fichero…"
        label="Arrastra aquí el Excel o el CSV"
        hint="Excel (.xlsx, .xls) o texto delimitado (.csv, .tsv). Hasta 25 MB."
      />

      {upload && sheet && (
        <Card>
          <div className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-fg-default">{upload.fileName}</p>
                <p className="text-xs text-fg-muted">
                  {sheet.totalRows.toLocaleString('es-ES')} filas · {sheet.headers.length} columnas
                </p>
              </div>
              {upload.sheets.length > 1 && (
                <div className="flex flex-col gap-1.5 sm:items-end">
                  <label className="flex items-center gap-2">
                    <span className="text-[11px] text-fg-subtle">
                      {object.lines ? 'Cabeceras' : 'Hoja'}
                    </span>
                    <SegmentedControl
                      size="sm"
                      value={sheet.name}
                      onChange={onChooseSheet}
                      options={upload.sheets.map((s) => ({ value: s.name, label: s.name }))}
                      aria-label="Hoja de cabeceras"
                    />
                  </label>

                  {object.lines && (
                    <label className="flex items-center gap-2">
                      <span className="text-[11px] text-fg-subtle">{object.lines.label}</span>
                      <SegmentedControl
                        size="sm"
                        value={linesSheet?.name || ''}
                        onChange={onChooseLinesSheet}
                        options={upload.sheets
                          .filter((s) => s.name !== sheet.name)
                          .map((s) => ({ value: s.name, label: s.name }))}
                        aria-label="Hoja de líneas"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            {object.lines && upload.sheets.length < 2 && (
              <div className="rounded-sm border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-fg-body">
                Este fichero solo tiene una hoja. {object.label} necesita dos: una con las cabeceras
                y otra con las {object.lines.label.toLowerCase()}.
              </div>
            )}

            {sheet.totalRows === 0 ? (
              <div className="rounded-sm border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-fg-body">
                Esta hoja no tiene ninguna fila de datos bajo la cabecera.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral">Vista previa</Badge>
                  <span className="text-[11px] text-fg-subtle">
                    Primeras {sheet.preview.length} filas, tal y como se han leído.
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <Table
                    responsive="scroll"
                    columns={columns}
                    data={sheet.preview}
                    density="compact"
                  />
                </div>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('es-ES');
  return String(value);
}
