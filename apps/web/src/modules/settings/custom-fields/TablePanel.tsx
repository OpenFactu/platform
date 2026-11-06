import React from 'react';
import {
  Badge,
  Button,
  Card,
  DropdownMenu,
  EmptyState,
  ListItem,
  SortableList,
} from '@openfactu/ui';
import {
  Copy,
  Database,
  ExternalLink,
  FileCode,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { PluginIcon } from '@/components/PluginIcon';
import { useI18n } from '@/i18n/I18nContext';
import { FIELD_TYPES, type FieldRow, type UserTableRow } from './fieldForm';

interface Props {
  tableName: string;
  /** La tabla propia seleccionada; sin ella es una tabla del sistema. */
  table: UserTableRow | null;
  fields: FieldRow[];
  onAddField: () => void;
  onEditField: (field: FieldRow) => void;
  onCloneField: (field: FieldRow) => void;
  onRemoveField: (field: FieldRow) => void;
  onReorder: (next: FieldRow[]) => void;
  onOpenRecords: () => void;
  onOpenTemplates: () => void;
  onEditTable: () => void;
  onRemoveTable: () => void;
}

/** Una tabla y sus campos, en el orden en que salen en formularios y PDF. */
export const TablePanel: React.FC<Props> = ({
  tableName,
  table,
  fields,
  onAddField,
  onEditField,
  onCloneField,
  onRemoveField,
  onReorder,
  onOpenRecords,
  onOpenTemplates,
  onEditTable,
  onRemoveTable,
}) => {
  const { t } = useI18n();
  const isDocument = table?.kind === 'document';
  const typeLabel = (fieldType: string) => {
    const type = FIELD_TYPES.find((option) => option.value === fieldType);
    return type ? t(`settingsFields.types.${type.key}.label`) : fieldType;
  };

  return (
    <Card
      noPadding
      title={
        <span className="flex items-center gap-2 flex-wrap">
          {table ? (
            <PluginIcon iconName={table.iconName || 'Table'} size={16} />
          ) : (
            <Database size={16} />
          )}
          {table?.label || tableName}
          {table && (
            <Badge variant={isDocument ? 'info' : 'neutral'}>
              {isDocument ? t('settingsFields.kinds.document') : t('settingsFields.kinds.master')}
            </Badge>
          )}
        </span>
      }
      subtitle={table?.description || (table ? undefined : t('settingsFields.systemTableHint'))}
      headerAction={
        <div className="flex items-center gap-2">
          {table && (
            <Button variant="secondary" size="sm" onClick={onOpenRecords} className="gap-2">
              <ExternalLink size={14} /> {t('settingsFields.openRecords')}
            </Button>
          )}
          <Button size="sm" onClick={onAddField} className="gap-2">
            <Plus size={14} /> {t('settingsFields.addField')}
          </Button>
          {table && (
            <DropdownMenu
              align="end"
              aria-label={t('settingsFields.tableActions')}
              items={[
                {
                  label: t('settingsFields.editTable'),
                  icon: <Pencil size={14} />,
                  onClick: onEditTable,
                },
                ...(isDocument
                  ? [
                      {
                        label: t('settingsFields.pdfTemplates'),
                        icon: <FileCode size={14} />,
                        onClick: onOpenTemplates,
                      },
                    ]
                  : []),
                {
                  label: t('settingsFields.deleteTable'),
                  icon: <Trash2 size={14} />,
                  destructive: true,
                  separatorBefore: true,
                  onClick: onRemoveTable,
                },
              ]}
            >
              <Button variant="ghost" size="sm" aria-label={t('settingsFields.tableActions')}>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenu>
          )}
        </div>
      }
    >
      {fields.length === 0 ? (
        <EmptyState
          icon={<Plus size={18} />}
          title={t('settingsFields.tableEmptyTitle')}
          hint={t('settingsFields.tableEmptyHint')}
          action={
            <Button size="sm" onClick={onAddField} className="gap-2">
              <Plus size={14} /> {t('settingsFields.addField')}
            </Button>
          }
        />
      ) : (
        <SortableList
          items={fields}
          getKey={(field) => field.id}
          onReorder={onReorder}
          handleLabel={t('settingsFields.dragToReorder')}
          renderItem={(field, { handleProps }) => (
            <ListItem
              variant="divided"
              density="compact"
              leading={
                <span
                  {...handleProps}
                  title={t('settingsFields.dragToReorder')}
                  // Al soltar el arrastre no debe abrirse la edición del campo.
                  onClick={(event) => event.stopPropagation()}
                >
                  <GripVertical size={14} className="text-fg-subtle" />
                </span>
              }
              title={field.label}
              subtitle={`${typeLabel(field.fieldType)} · ${field.fieldName}${field.section ? ` · ${field.section}` : ''}`}
              badge={
                <span className="flex items-center gap-1">
                  {field.required && (
                    <Badge variant="warning">{t('settingsFields.required')}</Badge>
                  )}
                  {field.readOnly && <Badge variant="info">{t('settingsFields.readOnly')}</Badge>}
                  {field.showInList && (
                    <Badge variant="success">{t('settingsFields.inList')}</Badge>
                  )}
                </span>
              }
              actions={[
                {
                  icon: <Copy size={14} />,
                  label: t('settingsFields.cloneToTable'),
                  onClick: () => onCloneField(field),
                },
                {
                  icon: <Trash2 size={14} />,
                  label: t('settingsFields.delete'),
                  tone: 'danger',
                  onClick: () => onRemoveField(field),
                },
              ]}
              onClick={() => onEditField(field)}
            />
          )}
        />
      )}
    </Card>
  );
};
