import React, { useMemo, useState } from 'react';
import { Accordion, EmptyState, SearchInput, Tabs } from '@openfactu/ui';
import { useDraggable } from '@dnd-kit/core';
import { Plus, Search } from 'lucide-react';
import { PluginIcon } from '@/components/PluginIcon';
import { useI18n } from '@/i18n/I18nContext';
import type { ElementKind } from '../components/canvas/types';
import type { BlockDef } from './blocks';
import { ELEMENT_GROUPS } from './constants';
import type { FieldDescriptor } from './types';

interface Props {
  blocks: BlockDef[];
  fields: FieldDescriptor[];
  isFreeOrLabel: boolean;
  /** Va encima de los datos: con ella se traen los que no están en el documento. */
  queries?: React.ReactNode;
  onAddBlock: (block: BlockDef) => void;
  onAddField: (field: FieldDescriptor) => void;
  onAddElement: (kind: ElementKind) => void;
}

type TabKey = 'blocks' | 'fields' | 'elements';

/** Fila que se añade con un clic o se arrastra al sitio exacto. */
const AddRow: React.FC<{
  id: string;
  data: Record<string, unknown>;
  icon?: string;
  title: string;
  hint?: string;
  tooltip?: string;
  onAdd: () => void;
}> = ({ id, data, icon, title, hint, tooltip, onAdd }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      title={tooltip}
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAdd();
        }
      }}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded border border-border-subtle bg-bg-card cursor-grab select-none touch-none hover:bg-bg-hover hover:border-border-default active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {icon && <PluginIcon iconName={icon} size={15} className="text-fg-muted shrink-0" />}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-fg-default truncate">{title}</div>
        {hint && <div className="text-[11px] leading-snug text-fg-muted">{hint}</div>}
      </div>
      <Plus size={13} className="text-fg-subtle opacity-0 group-hover:opacity-100 shrink-0" />
    </div>
  );
};

/** Panel izquierdo: todo lo que se puede poner en la plantilla, y con un buscador. */
export const AddPanel: React.FC<Props> = ({
  blocks,
  fields,
  isFreeOrLabel,
  queries,
  onAddBlock,
  onAddField,
  onAddElement,
}) => {
  const { t } = useI18n();
  const hasBlocks = blocks.length > 0;
  // Sin documento, lo primero que hace falta son datos.
  const [tab, setTab] = useState<TabKey>(hasBlocks ? 'blocks' : 'fields');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (...texts: Array<string | undefined>) =>
    !q || texts.some((text) => text?.toLowerCase().includes(q));

  const blockRows = blocks
    .map((block) => ({
      block,
      title: t(`templates.blocks.names.${block.id}`),
      hint: t(`templates.blocks.hints.${block.id}`),
    }))
    .filter((row) => matches(row.title, row.hint));

  const fieldGroups = useMemo(() => {
    const groups = new Map<string, FieldDescriptor[]>();
    for (const field of fields) {
      if (!matches(field.label, field.group, field.canvasPath)) continue;
      groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
    }
    return [...groups.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, q]);

  const elementGroups = ELEMENT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => matches(t(`templates.designer.palette.${item.kind}`))),
  })).filter((group) => group.items.length > 0);

  const nothing = (
    <EmptyState
      variant="compact"
      icon={<Search size={16} />}
      title={
        tab === 'fields' && fields.length === 0
          ? isFreeOrLabel
            ? t('templates.designer.fields.emptyFree')
            : t('templates.designer.fields.empty')
          : t('templates.designer.fields.noResults')
      }
    />
  );

  return (
    <aside className="w-72 shrink-0 border-r border-border-subtle bg-bg-card flex flex-col min-h-0">
      <div className="p-3 space-y-2 border-b border-border-subtle">
        <Tabs
          variant="segmented"
          size="sm"
          fullWidth
          value={tab}
          onChange={(key) => setTab(key as TabKey)}
          items={[
            ...(hasBlocks ? [{ key: 'blocks', label: t('templates.designer.add.blocks') }] : []),
            { key: 'fields', label: t('templates.designer.add.fields') },
            { key: 'elements', label: t('templates.designer.add.elements') },
          ]}
        />
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('templates.designer.add.search')}
          clearable
          inputSize="sm"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {tab === 'blocks' &&
          (blockRows.length === 0
            ? nothing
            : blockRows.map(({ block, title, hint }) => (
                <AddRow
                  key={block.id}
                  id={`block-${block.id}`}
                  data={{ action: 'createBlock', block, label: title }}
                  icon={block.icon}
                  title={title}
                  hint={hint}
                  onAdd={() => onAddBlock(block)}
                />
              )))}

        {tab === 'fields' && queries}
        {tab === 'fields' &&
          (fieldGroups.length === 0 ? (
            !queries && nothing
          ) : (
            <Accordion
              key={`${q ? 'searching' : 'browsing'}-${fieldGroups.length}`}
              type="multiple"
              defaultOpenKeys={q ? fieldGroups.map(([group]) => group) : [fieldGroups[0][0]]}
              items={fieldGroups.map(([group, list]) => ({
                key: group,
                title: <span className="text-xs font-semibold">{group}</span>,
                content: (
                  <div className="space-y-1">
                    {list.map((field) => (
                      <AddRow
                        key={field.key}
                        id={`fld-${field.key}`}
                        data={{ action: 'createField', descriptor: field }}
                        title={field.label}
                        tooltip={field.canvasPath}
                        onAdd={() => onAddField(field)}
                      />
                    ))}
                  </div>
                ),
              }))}
            />
          ))}

        {tab === 'elements' &&
          (elementGroups.length === 0
            ? nothing
            : elementGroups.map((group) => (
                <div key={group.key} className="space-y-1">
                  <div className="text-[11px] font-semibold text-fg-muted pt-1">
                    {t(`templates.designer.add.groups.${group.key}`)}
                  </div>
                  {group.items.map((item) => (
                    <AddRow
                      key={item.kind}
                      id={`palette-${item.kind}`}
                      data={{ action: 'create', kind: item.kind }}
                      icon={item.icon}
                      title={t(`templates.designer.palette.${item.kind}`)}
                      onAdd={() => onAddElement(item.kind)}
                    />
                  ))}
                </div>
              )))}
      </div>

      <p className="px-3 py-2 border-t border-border-subtle text-[11px] leading-snug text-fg-muted">
        {t('templates.designer.add.hint')}
      </p>
    </aside>
  );
};
