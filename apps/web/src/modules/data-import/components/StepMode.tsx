import React from 'react';
import { Card, SegmentedControl, Select, Badge } from '@openfactu/ui';
import { Info } from 'lucide-react';
import type { ImportMode, ImportObject, UploadedSheet } from '../types';
import { useI18n } from '@/i18n/I18nContext';
import { formatNumber } from '@/i18n/format';

interface Props {
  object: ImportObject;
  sheet: UploadedSheet;
  mapping: Record<string, string>;
  mode: ImportMode;
  matchBy: string | undefined;
  onModeChange: (mode: ImportMode) => void;
  onMatchByChange: (key: string) => void;
}

/** Claves de i18n; se traducen al pintar. */
const MODE_HELP: Record<ImportMode, string> = {
  insert: 'dataImport.mode.help.insert',
  update: 'dataImport.mode.help.update',
  upsert: 'dataImport.mode.help.upsert',
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
  const { t } = useI18n();
  const mappedFields = new Set(Object.values(mapping));
  const modes: Array<{ value: ImportMode; label: string; disabled?: boolean }> = [
    { value: 'insert', label: t('dataImport.mode.insert') },
    { value: 'update', label: t('dataImport.mode.update'), disabled: !object.supportsUpdate },
    { value: 'upsert', label: t('dataImport.mode.upsert'), disabled: !object.supportsUpdate },
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
            aria-label={t('dataImport.mode.ariaLabel')}
          />
          <p className="text-xs text-fg-muted">{t(MODE_HELP[mode])}</p>

          {!object.supportsUpdate && (
            <div className="flex items-start gap-2 rounded-sm border border-border-subtle bg-bg-muted px-3 py-2 text-xs text-fg-muted">
              <Info size={14} className="shrink-0 mt-px" />
              {t('dataImport.mode.insertOnlyNotice', { object: object.label })}
            </div>
          )}
        </div>
      </Card>

      {mode !== 'insert' && (
        <Card>
          <div className="p-4 space-y-2">
            <Select
              label={t('dataImport.mode.matchByLabel')}
              value={matchBy || ''}
              onChange={(v) => onMatchByChange(v)}
              options={object.naturalKeys.map((k) => ({
                value: k.key,
                label: mappedFields.has(k.key)
                  ? k.label
                  : t('dataImport.mode.unmapped', { label: k.label }),
              }))}
            />
            <p className="text-xs text-fg-muted">{t('dataImport.mode.matchByHint')}</p>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 space-y-2">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
            {t('dataImport.mode.summary')}
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-fg-muted">{t('dataImport.mode.object')}</dt>
            <dd className="text-fg-default font-medium">{object.label}</dd>
            <dt className="text-fg-muted">{t('dataImport.mode.sheet')}</dt>
            <dd className="text-fg-default font-medium">{sheet.name}</dd>
            <dt className="text-fg-muted">{t('dataImport.mode.rows')}</dt>
            <dd className="text-fg-default font-medium tabular-nums">
              {formatNumber(sheet.totalRows)}
            </dd>
            <dt className="text-fg-muted">{t('dataImport.mode.mappedColumns')}</dt>
            <dd className="text-fg-default font-medium tabular-nums">
              {t('dataImport.mode.mappedOf', {
                mapped: Object.keys(mapping).length,
                total: sheet.headers.length,
              })}
            </dd>
          </dl>
          {object.supportsUndo ? (
            <Badge variant="neutral">{t('dataImport.mode.undoable')}</Badge>
          ) : (
            <Badge variant="warning">{t('dataImport.mode.notUndoable')}</Badge>
          )}
        </div>
      </Card>
    </div>
  );
};
