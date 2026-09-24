import React, { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Input,
  Modal,
  SearchableSelect,
  Tooltip,
  type SearchableSelectOption,
} from '@openfactu/ui';
import { AlertTriangle, Bookmark, Info, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import type {
  AutomapEntry,
  ImportField,
  ImportObject,
  SavedMapping,
  UploadedSheet,
} from '../types';
import type { MappingIssue } from '../lib/mappingChecks';

interface Props {
  object: ImportObject;
  sheet: UploadedSheet;
  /** Solo en objetos con líneas: la segunda hoja del libro. */
  linesSheet: UploadedSheet | null;
  mapping: Record<string, string>;
  issues: MappingIssue[];
  savedMappings: SavedMapping[];
  onSetColumn: (column: string, field: string | null) => void;
  onReset: () => void;
  onClear: () => void;
  onApplySaved: (saved: SavedMapping) => void;
  onSaveMapping: (name: string) => void;
  onDeleteMapping: (saved: SavedMapping) => void;
}

const CONFIDENCE_LABEL: Record<NonNullable<AutomapEntry['confidence']>, string> = {
  exact: 'Coincide con la plantilla',
  synonym: 'Reconocido por su nombre habitual',
  partial: 'Parecido — revísalo',
};

function requiredMark(field: ImportField): string {
  if (field.required === true) return ' *';
  if (field.required === 'onInsert') return ' *';
  return '';
}

export const StepMapping: React.FC<Props> = ({
  object,
  sheet,
  linesSheet,
  mapping,
  issues,
  savedMappings,
  onSetColumn,
  onReset,
  onClear,
  onApplySaved,
  onSaveMapping,
  onDeleteMapping,
}) => {
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const options: SearchableSelectOption[] = useMemo(() => {
    const header = object.fields.map((f) => ({
      value: f.key,
      label: f.label + requiredMark(f),
      secondaryLabel: f.help || (f.ref ? `Se busca por ${f.ref.matchBy.join(' o ')}` : undefined),
      group: 'Campos',
    }));
    const lines = (object.lines?.fields || []).map((f) => ({
      value: f.key,
      label: f.label + requiredMark(f),
      group: object.lines?.label || 'Líneas',
    }));
    return [...header, ...lines];
  }, [object]);

  const confidenceOf = (column: string) =>
    sheet.automap.find((a) => a.column === column)?.confidence ?? null;

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5">
          <Wand2 size={14} /> Automapeo
        </Button>
        <Button variant="outline" size="sm" onClick={onClear} className="gap-1.5">
          <RotateCcw size={14} /> Vaciar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSaveOpen(true)}
          className="gap-1.5"
          disabled={Object.keys(mapping).length === 0}
        >
          <Bookmark size={14} /> Guardar mapeo
        </Button>

        {savedMappings.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-fg-subtle">Guardados:</span>
            {savedMappings.map((saved) => (
              <span key={saved.id} className="inline-flex items-center">
                <Button variant="ghost" size="sm" onClick={() => onApplySaved(saved)}>
                  {saved.name}
                </Button>
                <Tooltip content="Borrar este mapeo">
                  <button
                    type="button"
                    onClick={() => onDeleteMapping(saved)}
                    className="p-1 text-fg-subtle hover:text-danger transition-colors"
                    aria-label={`Borrar el mapeo ${saved.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </Tooltip>
              </span>
            ))}
          </div>
        )}
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="space-y-1.5">
          {errors.map((issue, i) => (
            <div
              key={`e${i}`}
              className="flex items-start gap-2 rounded-sm border border-danger/40 bg-danger-bg px-3 py-2 text-xs text-fg-body"
            >
              <AlertTriangle size={14} className="text-danger shrink-0 mt-px" />
              {issue.message}
            </div>
          ))}
          {warnings.map((issue, i) => (
            <div
              key={`w${i}`}
              className="flex items-start gap-2 rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-xs text-fg-muted"
            >
              <Info size={14} className="shrink-0 mt-px" />
              {issue.message}
            </div>
          ))}
        </div>
      )}

      <SheetMapping
        sheet={sheet}
        title={linesSheet ? `Cabeceras · hoja "${sheet.name}"` : undefined}
        groupBy={object.lines?.groupBy}
        mapping={mapping}
        options={options}
        confidenceOf={confidenceOf}
        onSetColumn={onSetColumn}
      />

      {linesSheet && (
        <SheetMapping
          sheet={linesSheet}
          title={`${object.lines?.label} · hoja "${linesSheet.name}"`}
          groupBy={object.lines?.groupBy}
          mapping={mapping}
          options={options}
          confidenceOf={confidenceOf}
          onSetColumn={onSetColumn}
        />
      )}

      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title="Guardar este mapeo">
        <Modal.Body>
          <Input
            label="Nombre"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Excel del gestor"
            autoFocus
          />
          <p className="text-xs text-fg-muted mt-2">
            Se guarda para {object.label.toLowerCase()}. Si repites un nombre, se sobrescribe el
            anterior.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => setSaveOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!saveName.trim()}
            onClick={() => {
              onSaveMapping(saveName.trim());
              setSaveName('');
              setSaveOpen(false);
            }}
          >
            Guardar
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

/**
 * Las columnas de UNA hoja con su campo destino. Se usa dos veces cuando el
 * objeto tiene líneas: cabeceras y líneas están en pestañas distintas del
 * libro pero comparten un único mapeo.
 */
const SheetMapping: React.FC<{
  sheet: UploadedSheet;
  title?: string;
  groupBy?: string;
  mapping: Record<string, string>;
  options: SearchableSelectOption[];
  confidenceOf: (column: string) => AutomapEntry['confidence'];
  onSetColumn: (column: string, field: string | null) => void;
}> = ({ sheet, title, groupBy, mapping, options, confidenceOf, onSetColumn }) => (
  <Card>
    {title && (
      <div className="px-4 pt-3 text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
        {title}
      </div>
    )}
    <div className="divide-y divide-border-subtle">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2 px-4 py-2 bg-bg-muted">
        <span className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
          Columna del fichero
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
          Campo de Keirost
        </span>
      </div>

      {sheet.headers.map((column) => {
        const confidence = confidenceOf(column);
        const sample = sheet.preview.find(
          (r) => r[column] !== null && r[column] !== undefined && r[column] !== '',
        )?.[column];
        const isGroupColumn = column === groupBy;

        return (
          <div
            key={`${sheet.name}:${column}`}
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2 px-4 py-2.5 items-center"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fg-default truncate">{column}</span>
                {isGroupColumn ? (
                  <Badge variant="accent">enlace</Badge>
                ) : (
                  confidence &&
                  mapping[column] && (
                    <Tooltip content={CONFIDENCE_LABEL[confidence]}>
                      <Badge variant={confidence === 'partial' ? 'warning' : 'neutral'}>auto</Badge>
                    </Tooltip>
                  )
                )}
              </div>
              {sample !== undefined && (
                <p className="text-[11px] text-fg-subtle truncate">
                  p. ej. {String(sample).slice(0, 60)}
                </p>
              )}
            </div>

            {isGroupColumn ? (
              // No se mapea a ningún campo: es lo que empareja cada cabecera
              // con sus líneas, y sin ella no se podría armar el documento.
              <p className="text-xs text-fg-muted">
                Une cada cabecera con sus líneas. No se importa como dato.
              </p>
            ) : (
              <SearchableSelect
                value={mapping[column] || ''}
                onChange={(value) => onSetColumn(column, value || null)}
                options={options}
                placeholder="No importar esta columna"
                clearable
                emptyMessage="Ningún campo coincide"
              />
            )}
          </div>
        );
      })}
    </div>
  </Card>
);
