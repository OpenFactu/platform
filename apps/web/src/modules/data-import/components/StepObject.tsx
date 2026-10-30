import React, { useMemo, useState } from 'react';
import { Card, SearchInput, Badge, EmptyState, Skeleton } from '@openfactu/ui';
import { Boxes, ChevronRight, Database } from 'lucide-react';
import type { ImportGroup, ImportObject } from '../types';
import { useI18n } from '@/i18n/I18nContext';

/** Claves de i18n; se traducen al pintar. */
const GROUP_LABELS: Record<ImportGroup, string> = {
  maestros: 'dataImport.groups.maestros',
  stock: 'dataImport.groups.stock',
  documentos: 'dataImport.groups.documentos',
  contabilidad: 'dataImport.groups.contabilidad',
  rrhh: 'dataImport.groups.rrhh',
  crm: 'dataImport.groups.crm',
};

const GROUP_ORDER: ImportGroup[] = [
  'maestros',
  'stock',
  'documentos',
  'contabilidad',
  'rrhh',
  'crm',
];

interface Props {
  objects: ImportObject[];
  loading: boolean;
  selected: ImportObject | null;
  onSelect: (object: ImportObject) => void;
}

export const StepObject: React.FC<Props> = ({ objects, loading, selected, onSelect }) => {
  const { t } = useI18n();
  const [term, setTerm] = useState('');

  const grouped = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const matches = objects.filter(
      (o) =>
        !needle ||
        o.label.toLowerCase().includes(needle) ||
        (o.description || '').toLowerCase().includes(needle),
    );
    return GROUP_ORDER.map((group) => ({
      group,
      items: matches.filter((o) => o.group === group),
    })).filter((g) => g.items.length > 0);
  }, [objects, term]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (objects.length === 0) {
    return (
      <EmptyState
        icon={<Database size={32} />}
        title={t('dataImport.object.emptyTitle')}
        hint={t('dataImport.object.emptyHint')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={term}
        onChange={setTerm}
        placeholder={t('dataImport.object.searchPlaceholder')}
        className="max-w-sm"
      />

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Boxes size={28} />}
          title={t('dataImport.object.noMatchTitle')}
          hint={t('dataImport.object.noMatchHint')}
        />
      ) : (
        grouped.map(({ group, items }) => (
          <div key={group} className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
              {t(GROUP_LABELS[group])}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((object) => {
                const active = selected?.id === object.id;
                return (
                  // `Card` no acepta onClick: el botón envolvente es además lo
                  // correcto para que la tarjeta se pueda elegir con teclado.
                  <button
                    key={object.id}
                    type="button"
                    onClick={() => onSelect(object)}
                    className="text-left w-full"
                    aria-pressed={active}
                  >
                    <Card
                      className={`cursor-pointer transition-all hover:border-primary/40 ${
                        active ? 'border-primary ring-1 ring-primary/30' : ''
                      }`}
                    >
                      <div className="p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-fg-default truncate">
                              {object.label}
                            </span>
                            {!object.supportsUpdate && (
                              <Badge variant="neutral">{t('dataImport.object.insertOnly')}</Badge>
                            )}
                          </div>
                          {object.description && (
                            <p className="text-xs text-fg-muted mt-0.5">{object.description}</p>
                          )}
                          <p className="text-[11px] text-fg-subtle mt-1">
                            {t('dataImport.object.columnsAvailable', {
                              count: object.fields.length,
                            })}
                            {object.lines
                              ? ` · ${t('dataImport.object.withLines', {
                                  lines: object.lines.label.toLowerCase(),
                                })}`
                              : ''}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-fg-subtle shrink-0 mt-1" />
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
