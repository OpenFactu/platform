import React from 'react';
import { Card, SegmentedControl, Select, Badge } from '@openfactu/ui';
import { Info } from 'lucide-react';
import type { ImportMode, ImportObject, UploadedSheet } from '../types';

interface Props {
  object: ImportObject;
  sheet: UploadedSheet;
  mapping: Record<string, string>;
  mode: ImportMode;
  matchBy: string | undefined;
  onModeChange: (mode: ImportMode) => void;
  onMatchByChange: (key: string) => void;
}

const MODE_HELP: Record<ImportMode, string> = {
  insert: 'Cada fila crea un registro nuevo. Si ya existe uno con la misma clave, la fila falla.',
  update:
    'No se crea nada: cada fila busca un registro existente y lo modifica. Una fila que no case, falla.',
  upsert:
    'Si el registro existe se actualiza; si no, se crea. Es lo habitual al recargar un fichero corregido.',
};

export const StepMode: React.FC<Props> = ({
  object,
  sheet,
  mapping,
  mode,
  matchBy,
  onModeChange,
  onMatchByChange,
}) => {
  const mappedFields = new Set(Object.values(mapping));
  const modes: Array<{ value: ImportMode; label: string; disabled?: boolean }> = [
    { value: 'insert', label: 'Solo alta' },
    { value: 'update', label: 'Solo actualizar', disabled: !object.supportsUpdate },
    { value: 'upsert', label: 'Alta o actualización', disabled: !object.supportsUpdate },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 space-y-3">
          <SegmentedControl
            value={mode}
            onChange={(v) => onModeChange(v as ImportMode)}
            options={modes}
            fullWidth
            aria-label="Modo de importación"
          />
          <p className="text-xs text-fg-muted">{MODE_HELP[mode]}</p>

          {!object.supportsUpdate && (
            <div className="flex items-start gap-2 rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-xs text-fg-muted">
              <Info size={14} className="shrink-0 mt-px" />
              {object.label} solo admite alta: su endpoint no expone modificación.
            </div>
          )}
        </div>
      </Card>

      {mode !== 'insert' && (
        <Card>
          <div className="p-4 space-y-2">
            <Select
              label="Buscar el registro existente por"
              value={matchBy || ''}
              onChange={(v) => onMatchByChange(v)}
              options={object.naturalKeys.map((k) => ({
                value: k.key,
                label: mappedFields.has(k.key) ? k.label : `${k.label} (sin mapear)`,
              }))}
            />
            <p className="text-xs text-fg-muted">
              Ese campo tiene que venir en el fichero: es lo que empareja cada fila con lo que ya
              hay en Keirost.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
            Resumen
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-fg-muted">Objeto</dt>
            <dd className="text-fg-default font-medium">{object.label}</dd>
            <dt className="text-fg-muted">Hoja</dt>
            <dd className="text-fg-default font-medium">{sheet.name}</dd>
            <dt className="text-fg-muted">Filas</dt>
            <dd className="text-fg-default font-medium tabular-nums">
              {sheet.totalRows.toLocaleString('es-ES')}
            </dd>
            <dt className="text-fg-muted">Columnas mapeadas</dt>
            <dd className="text-fg-default font-medium tabular-nums">
              {Object.keys(mapping).length} de {sheet.headers.length}
            </dd>
          </dl>
          {object.supportsUndo ? (
            <Badge variant="neutral">Se podrá deshacer</Badge>
          ) : (
            <Badge variant="warning">Esta importación no se puede deshacer</Badge>
          )}
        </div>
      </Card>
    </div>
  );
};
