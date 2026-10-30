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
import { useI18n } from '@/i18n/I18nContext';

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

/** Claves de i18n; se traducen al pintar. */
const CONFIDENCE_LABEL: Record<NonNullable<AutomapEntry['confidence']>, string> = {
  exact: 'dataImport.mapping.confidence.exact',
  synonym: 'dataImport.mapping.confidence.synonym',
  partial: 'dataImport.mapping.confidence.partial',
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
  const { t } = useI18n();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');

  const options: SearchableSelectOption[] = useMemo(() => {
    const header = object.fields.map((f) => ({
      value: f.key,
      label: f.label + requiredMark(f),
      secondaryLabel:
        f.help ||
        (f.ref
          ? t('dataImport.mapping.searchedBy', {
              fields: f.ref.matchBy.join(t('dataImport.mapping.or')),
            })
          : undefined),
      group: t('dataImport.mapping.fieldsGroup'),
    }));
    const lines = (object.lines?.fields || []).map((f) => ({
      value: f.key,
      label: f.label + requiredMark(f),
      group: object.lines?.label || t('dataImport.mapping.linesGroup'),
    }));
    return [...header, ...lines];
  }, [object, t]);

  const confidenceOf = (column: string) =>
    sheet.automap.find((a) => a.column === column)?.confidence ?? null;

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5">
          <Wand2 size={14} /> {t('dataImport.mapping.automap')}
        </Button>
        <Button variant="outline" size="sm" onClick={onClear} className="gap-1.5">
          <RotateCcw size={14} /> {t('dataImport.mapping.clear')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSaveOpen(true)}
          className="gap-1.5"
          disabled={Object.keys(mapping).length === 0}
        >
          <Bookmark size={14} /> {t('dataImport.mapping.save')}
        </Button>

        {savedMappings.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <span className="text-[11px] text-fg-subtle">{t('dataImport.mapping.saved')}</span>
            {savedMappings.map((saved) => (
              <span key={saved.id} className="inline-flex items-center">
                <Button variant="ghost" size="sm" onClick={() => onApplySaved(saved)}>
                  {saved.name}
                </Button>
                <Tooltip content={t('dataImport.mapping.deleteTooltip')}>
                  <button
                    type="button"
                    onClick={() => onDeleteMapping(saved)}
                    className="p-1 text-fg-subtle hover:text-danger transition-colors"
                    aria-label={t('dataImport.mapping.deleteAria', { name: saved.name })}
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
        title={
          linesSheet ? t('dataImport.mapping.headersSheetTitle', { sheet: sheet.name }) : undefined
        }
        groupBy={object.lines?.groupBy}
        mapping={mapping}
        options={options}
        confidenceOf={confidenceOf}
        onSetColumn={onSetColumn}
      />

      {linesSheet && (
        <SheetMapping
          sheet={linesSheet}
          title={t('dataImport.mapping.linesSheetTitle', {
            lines: object.lines?.label ?? '',
            sheet: linesSheet.name,
          })}
          groupBy={object.lines?.groupBy}
          mapping={mapping}
          options={options}
          confidenceOf={confidenceOf}
          onSetColumn={onSetColumn}
        />
      )}

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={t('dataImport.mapping.saveModalTitle')}
      >
        <Modal.Body>
          <Input
            label={t('dataImport.mapping.name')}
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t('dataImport.mapping.namePlaceholder')}
            autoFocus
          />
          <p className="text-xs text-fg-muted mt-2">
            {t('dataImport.mapping.saveHint', { object: object.label.toLowerCase() })}
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline" onClick={() => setSaveOpen(false)}>
            {t('dataImport.mapping.cancel')}
          </Button>
          <Button
            disabled={!saveName.trim()}
            onClick={() => {
              onSaveMapping(saveName.trim());
              setSaveName('');
              setSaveOpen(false);
            }}
          >
            {t('dataImport.mapping.confirmSave')}
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
}> = ({ sheet, title, groupBy, mapping, options, confidenceOf, onSetColumn }) => {
  const { t } = useI18n();
  return (
    <Card>
      {title && (
        <div className="px-4 pt-3 text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
          {title}
        </div>
      )}
      <div className="divide-y divide-border-subtle">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-2 px-4 py-2 bg-bg-muted">
          <span className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
            {t('dataImport.mapping.fileColumn')}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
            {t('dataImport.mapping.keirostField')}
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
                    <Badge variant="accent">{t('dataImport.mapping.link')}</Badge>
                  ) : (
                    confidence &&
                    mapping[column] && (
                      <Tooltip content={t(CONFIDENCE_LABEL[confidence])}>
                        <Badge variant={confidence === 'partial' ? 'warning' : 'neutral'}>
                          {t('dataImport.mapping.auto')}
                        </Badge>
                      </Tooltip>
                    )
                  )}
                </div>
                {sample !== undefined && (
                  <p className="text-[11px] text-fg-subtle truncate">
                    {t('dataImport.mapping.example', { sample: String(sample).slice(0, 60) })}
                  </p>
                )}
              </div>

              {isGroupColumn ? (
                // No se mapea a ningún campo: es lo que empareja cada cabecera
                // con sus líneas, y sin ella no se podría armar el documento.
                <p className="text-xs text-fg-muted">{t('dataImport.mapping.linkHint')}</p>
              ) : (
                <SearchableSelect
                  value={mapping[column] || ''}
                  onChange={(value) => onSetColumn(column, value || null)}
                  options={options}
                  placeholder={t('dataImport.mapping.skipColumn')}
                  clearable
                  emptyMessage={t('dataImport.mapping.noFieldMatch')}
                />
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
