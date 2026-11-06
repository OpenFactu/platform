import React, { useState } from 'react';
import { Button, Tooltip } from '@openfactu/ui';
import { Database, Pencil, Plus, Table, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { SqlEditorModal } from '../components/SqlEditorModal';
import type { CanvasLayout } from '../components/canvas/types';

type Queries = NonNullable<CanvasLayout['queries']>;

/** Una consulta en edición; sin `index`, aún no existe y solo se crea si se guarda. */
interface Editing {
  index: number | null;
  name: string;
  sql: string;
}

const nextName = (queries: Queries) => {
  let n = queries.length + 1;
  while (queries.some((query) => query.name === `consulta${n}`)) n++;
  return `consulta${n}`;
};

/**
 * Traer datos que no están en el documento: se escribe una consulta y sus columnas aparecen
 * debajo para ponerlas en el papel, sueltas o como tabla. Es también como se monta un informe.
 */
export const QueriesPanel: React.FC<{
  queries: Queries;
  columns: Record<string, string[]>;
  errors: Record<string, string>;
  docType?: string;
  onChange: (queries: Queries) => void;
  onAddTable: (name: string) => void;
}> = ({ queries, columns, errors, docType, onChange, onAddTable }) => {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Editing | null>(null);

  const save = (sql: string) => {
    if (!editing) return;
    onChange(
      editing.index === null
        ? [...queries, { name: editing.name, sql }]
        : queries.map((query, index) => (index === editing.index ? { ...query, sql } : query)),
    );
  };

  return (
    <div className="space-y-1.5 pb-2 mb-1 border-b border-border-subtle">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-default">
          {t('templates.designer.add.queries')}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="gap-1"
          onClick={() => setEditing({ index: null, name: nextName(queries), sql: '' })}
        >
          <Plus size={13} /> {t('templates.designer.add.newQuery')}
        </Button>
      </div>
      {queries.length === 0 && (
        <p className="text-[11px] leading-snug text-fg-muted">
          {t('templates.designer.add.queriesHint')}
        </p>
      )}
      {queries.map((query, index) => {
        const count = columns[query.name]?.length ?? 0;
        return (
          <div
            key={`${query.name}-${index}`}
            className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded border border-border-subtle bg-bg-card"
          >
            <Database size={14} className="text-fg-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-fg-default truncate">{query.name}</div>
              <div
                className={`text-[11px] truncate ${errors[query.name] ? 'text-danger' : 'text-fg-muted'}`}
                title={errors[query.name]}
              >
                {errors[query.name] ??
                  (count
                    ? t('templates.designer.add.queryColumns', { count })
                    : t('templates.designer.add.queryPending'))}
              </div>
            </div>
            <Tooltip content={t('templates.designer.add.queryAsTable')}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!count}
                aria-label={t('templates.designer.add.queryAsTable')}
                onClick={() => onAddTable(query.name)}
              >
                <Table size={14} />
              </Button>
            </Tooltip>
            <Tooltip content={t('templates.designer.add.queryEdit')}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('templates.designer.add.queryEdit')}
                onClick={() => setEditing({ index, name: query.name, sql: query.sql })}
              >
                <Pencil size={14} />
              </Button>
            </Tooltip>
            <Tooltip content={t('templates.designer.add.queryDelete')}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-danger"
                aria-label={t('templates.designer.add.queryDelete')}
                onClick={() => onChange(queries.filter((_, i) => i !== index))}
              >
                <Trash2 size={14} />
              </Button>
            </Tooltip>
          </div>
        );
      })}
      <SqlEditorModal
        open={!!editing}
        title={t('templates.designer.queries.editorTitle', { name: editing?.name ?? '' })}
        queryName={editing?.name}
        docType={docType}
        initialSql={editing?.sql ?? ''}
        onSave={save}
        onClose={() => setEditing(null)}
      />
    </div>
  );
};
