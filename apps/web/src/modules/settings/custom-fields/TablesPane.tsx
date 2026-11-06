import React, { useMemo } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  List,
  SearchInput,
  type ListSectionData,
} from '@openfactu/ui';
import { Database, Plus, Table as TableIcon } from 'lucide-react';
import { PluginIcon } from '@/components/PluginIcon';
import { useI18n } from '@/i18n/I18nContext';
import type { FieldRow, UserTableRow } from './fieldForm';

interface Props {
  tables: UserTableRow[];
  fieldsByTable: Map<string, FieldRow[]>;
  filter: string;
  onFilterChange: (value: string) => void;
  selected: string | null;
  onSelect: (tableName: string) => void;
  onCreateTable: () => void;
}

const matches = (query: string, ...texts: Array<string | null | undefined>) =>
  texts.some((text) => text?.toLowerCase().includes(query));

/** Las tablas en las que hay algo que configurar: las propias y las del sistema con campos. */
export const TablesPane: React.FC<Props> = ({
  tables,
  fieldsByTable,
  filter,
  onFilterChange,
  selected,
  onSelect,
  onCreateTable,
}) => {
  const { t } = useI18n();

  const sections = useMemo<ListSectionData[]>(() => {
    const query = filter.trim().toLowerCase();
    const fieldsOf = (tableName: string) => fieldsByTable.get(tableName) ?? [];
    const visible = (tableName: string, label?: string | null) =>
      !query ||
      matches(query, tableName, label) ||
      fieldsOf(tableName).some((f) => matches(query, f.fieldName, f.label));
    const count = (tableName: string) => (
      <Badge variant="neutral">{fieldsOf(tableName).length}</Badge>
    );

    const own = tables
      .filter((table) => visible(table.tableName, table.label))
      .map((table) => ({
        id: table.tableName,
        icon: <PluginIcon iconName={table.iconName || 'Table'} size={15} />,
        title: table.label || table.tableName,
        subtitle:
          table.kind === 'document'
            ? t('settingsFields.kinds.document')
            : t('settingsFields.kinds.master'),
        badge: count(table.tableName),
        onClick: () => onSelect(table.tableName),
      }));
    const ownNames = new Set(tables.map((table) => table.tableName));
    const system = [...fieldsByTable.keys()]
      .filter((tableName) => !ownNames.has(tableName) && visible(tableName))
      .sort((a, b) => a.localeCompare(b))
      .map((tableName) => ({
        id: tableName,
        icon: <Database size={15} />,
        title: tableName,
        badge: count(tableName),
        onClick: () => onSelect(tableName),
      }));

    return [
      {
        key: 'own',
        label: t('settingsFields.ownTables'),
        items: own,
        emptyState: <EmptyState variant="compact" title={t('settingsFields.noOwnTables')} />,
      },
      ...(system.length
        ? [{ key: 'system', label: t('settingsFields.systemTables'), items: system }]
        : []),
    ];
  }, [tables, fieldsByTable, filter, onSelect, t]);

  const hasTables = sections.some((section) => section.items.length > 0);

  return (
    <Card noPadding>
      <div className="p-3 border-b border-border-subtle">
        <SearchInput
          value={filter}
          onChange={onFilterChange}
          placeholder={t('settingsFields.filterPlaceholder')}
          clearable
        />
      </div>
      {hasTables ? (
        <List
          sections={sections}
          activeId={selected}
          density="compact"
          staggerAnimation={false}
          aria-label={t('settingsFields.ownTables')}
        />
      ) : (
        <List
          items={[]}
          emptyState={{
            icon: <TableIcon size={18} />,
            title: t(filter ? 'settingsFields.noMatchesTitle' : 'settingsFields.noTablesTitle'),
            hint: filter ? undefined : t('settingsFields.noTablesHint'),
            variant: 'compact',
            action: filter ? undefined : (
              <Button size="sm" onClick={onCreateTable} className="gap-1">
                <Plus size={12} /> {t('settingsFields.newTable')}
              </Button>
            ),
          }}
        />
      )}
    </Card>
  );
};
