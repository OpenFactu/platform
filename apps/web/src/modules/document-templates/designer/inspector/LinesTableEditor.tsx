import React, { useState } from 'react';
import { Button, ColorInput, Select, SortableList } from '@openfactu/ui';
import { Plus } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import type { LinesTableColumn, LinesTableElement } from '../../components/canvas/types';
import {
  getLineFieldGroup,
  inferDefaultFormat,
  type FieldDef,
} from '../../components/canvas/fieldRegistry';
import { genId } from '../elements';
import { columnsFromQueryCols, guessColumnFormat, shortLabel } from '../fieldDescriptors';
import { fieldName } from '../fieldNames';
import { ColumnRow } from './ColumnRow';
import { Label, NumberField, Section, Toggle } from './controls';

export const LinesTableEditor: React.FC<{
  element: LinesTableElement;
  onPatch: (p: Partial<LinesTableElement>) => void;
  extraLineFields?: FieldDef[];
  queryColumns?: Record<string, string[]>;
  queryNames?: string[];
  isFreeOrLabel?: boolean;
}> = ({
  element,
  onPatch,
  extraLineFields = [],
  queryColumns = {},
  queryNames = [],
  isFreeOrLabel = false,
}) => {
  const { t } = useI18n();
  const [openColumn, setOpenColumn] = useState<string | null>(null);
  // Fuente actual: 'lines' (documento) o 'query:NOMBRE'.
  const queryName =
    element.source && element.source.startsWith('query:')
      ? element.source.slice('query:'.length)
      : null;
  // Campos que puede mostrar una columna: los de la consulta o los de la línea.
  const queryCols = queryName ? (queryColumns[queryName] ?? []) : [];
  const lineFields: FieldDef[] = queryName
    ? queryCols.map((c) => ({ path: c, type: 'string' as const, description: c }))
    : [...(getLineFieldGroup()?.fields ?? []), ...extraLineFields];

  const updateColumn = (idx: number, changes: Partial<LinesTableColumn>) => {
    onPatch({
      columns: element.columns.map((c, i) => (i === idx ? { ...c, ...changes } : c)),
    });
  };
  const addColumn = () => {
    // Por defecto, el primer dato que aún no tenga columna.
    const used = new Set(element.columns.map((c) => c.path));
    const next = lineFields.find((f) => !used.has(f.path)) ?? lineFields[0];
    const base = next
      ? {
          label: queryName ? shortLabel(next.path) : fieldName(next.path, next.description),
          path: next.path,
          format: queryName ? guessColumnFormat(next.path) : inferDefaultFormat(next),
        }
      : { label: t('templates.designer.lt.newColumn'), path: 'itemName' };
    onPatch({
      columns: [
        ...element.columns,
        { id: genId('col'), widthPct: 10, align: 'left' as const, ...base },
      ],
    });
  };
  const removeColumn = (idx: number) => {
    onPatch({ columns: element.columns.filter((_, i) => i !== idx) });
  };
  const evenWidths = () => {
    const width = Math.round(100 / Math.max(element.columns.length, 1));
    onPatch({ columns: element.columns.map((c) => ({ ...c, widthPct: width })) });
  };

  return (
    <>
      <Section title={t('templates.designer.lt.columns', { count: element.columns.length })}>
        <SortableList
          items={element.columns}
          getKey={(col) => col.id}
          onReorder={(columns) => onPatch({ columns })}
          handleLabel={t('templates.designer.lt.reorder')}
          className="space-y-1"
          renderItem={(col, { index, handleProps }) => {
            const options = lineFields.map((f) => ({
              value: f.path,
              label: queryName ? f.path : fieldName(f.path, f.description),
            }));
            if (!options.some((o) => o.value === col.path)) {
              options.unshift({ value: col.path, label: col.path });
            }
            return (
              <ColumnRow
                column={col}
                open={openColumn === col.id}
                options={options}
                detailOptions={queryName ? undefined : options}
                handleProps={handleProps}
                onToggle={() => setOpenColumn(openColumn === col.id ? null : col.id)}
                onChange={(changes) => updateColumn(index, changes)}
                onPickData={(path) => {
                  const field = lineFields.find((f) => f.path === path);
                  updateColumn(index, {
                    path,
                    format: field && !queryName ? inferDefaultFormat(field) : col.format,
                  });
                }}
                onRemove={() => removeColumn(index)}
              />
            );
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" className="gap-1" onClick={addColumn}>
            <Plus size={13} /> {t('templates.designer.lt.add')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={evenWidths}>
            {t('templates.designer.lt.evenWidths')}
          </Button>
        </div>
      </Section>

      <Section title={t('templates.designer.lt.title')} defaultOpen={false}>
        {(queryNames.length > 0 || isFreeOrLabel) && (
          <>
            <Label>{t('templates.designer.source.title')}</Label>
            <Select
              options={[
                { value: '', label: t('templates.designer.source.docLines') },
                ...queryNames.map((n) => ({
                  value: `query:${n}`,
                  label: t('templates.designer.fields.queryGroup', { name: n }),
                })),
              ]}
              value={element.source ?? ''}
              onChange={(value) => {
                if (!value) {
                  onPatch({ source: undefined });
                  return;
                }
                const name = value.slice('query:'.length);
                const cols = queryColumns[name] ?? [];
                // Al elegir una query con columnas conocidas, autocompletamos la
                // tabla con sus campos. Solo lo hacemos si tiene columnas (si no,
                // dejamos las actuales para no vaciar el diseño).
                if (cols.length > 0) {
                  onPatch({ source: value, columns: columnsFromQueryCols(cols) });
                } else {
                  onPatch({ source: value });
                }
              }}
              ariaLabel={t('templates.designer.source.title')}
            />
            {isFreeOrLabel && !queryName && (
              <div className="text-[10px] text-warning leading-snug">
                {t('templates.designer.lt.freeHint')}
              </div>
            )}
            {queryName && queryCols.length === 0 && (
              <div className="text-[10px] text-warning leading-snug">
                {t('templates.designer.lt.noColumns', { name: queryName })}
              </div>
            )}
          </>
        )}
        <Label>{t('templates.designer.lt.layout')}</Label>
        <Select
          options={[
            { value: 'table', label: t('templates.designer.lt.layoutTable') },
            { value: 'keyValue', label: t('templates.designer.lt.layoutKeyValue') },
          ]}
          value={element.layout ?? 'table'}
          onChange={(v) => onPatch({ layout: v as LinesTableElement['layout'] })}
          ariaLabel={t('templates.designer.lt.layout')}
        />
        {(element.layout ?? 'table') === 'table' && (
          <>
            <Label>{t('templates.designer.lt.preset')}</Label>
            <Select
              options={[
                { value: 'neutral', label: t('templates.designer.lt.presetNeutral') },
                { value: 'default', label: t('templates.designer.lt.presetDefault') },
                { value: 'bordered', label: t('templates.designer.lt.presetBordered') },
                { value: 'striped', label: t('templates.designer.lt.presetStriped') },
                { value: 'compact', label: t('templates.designer.lt.presetCompact') },
                { value: 'borderless', label: t('templates.designer.lt.presetBorderless') },
              ]}
              value={element.tableStyle ?? 'default'}
              onChange={(v) => onPatch({ tableStyle: v as LinesTableElement['tableStyle'] })}
              ariaLabel={t('templates.designer.lt.preset')}
            />
            <div className="grid grid-cols-2 gap-2">
              <ColorInput
                size="sm"
                showHex={false}
                label={t('templates.designer.lt.headerBg')}
                value={element.headerBg ?? '#f1f5f9'}
                onChange={(headerBg) => onPatch({ headerBg })}
              />
              <ColorInput
                size="sm"
                showHex={false}
                label={t('templates.designer.lt.borderColor')}
                value={element.borderColor ?? '#e5e7eb'}
                onChange={(borderColor) => onPatch({ borderColor })}
              />
            </div>
            <NumberField
              label={t('templates.designer.lt.cellPadding')}
              value={element.cellPadding ?? 4}
              onChange={(v) => onPatch({ cellPadding: Math.max(0, v) })}
            />
          </>
        )}
        <Toggle
          label={t('templates.designer.lt.showHeader')}
          checked={element.showHeader !== false}
          onChange={(v) => onPatch({ showHeader: v })}
        />
      </Section>
    </>
  );
};
