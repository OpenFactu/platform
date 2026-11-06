import React, { useState } from 'react';
import {
  Button,
  Card,
  DropdownMenu,
  EmptyState,
  Field,
  FileDropzone,
  List,
  Loader,
  Modal,
  PageHeader,
  SearchableSelect,
  usePopup,
} from '@openfactu/ui';
import {
  Download,
  MoreHorizontal,
  Package,
  Plus,
  Table as TableIcon,
  Upload,
  Wrench,
} from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useTabs } from '@/context/TabsContext';
import { FieldDrawer } from '../custom-fields/FieldDrawer';
import { TableModal } from '../custom-fields/TableModal';
import { TablePanel } from '../custom-fields/TablePanel';
import { TablesPane } from '../custom-fields/TablesPane';
import {
  defaultFieldForm,
  defaultTableForm,
  fieldFormFromRow,
  tableFormFromRow,
  type FieldForm,
  type FieldRow,
  type TableForm,
} from '../custom-fields/fieldForm';
import { useCustomFields } from '../custom-fields/useCustomFields';

/** Tablas propias y campos personalizados: la lista de tablas a un lado y la elegida al otro. */
export const CustomFields: React.FC = () => {
  const { t } = useI18n();
  const { openTab } = useTabs();
  const popup = usePopup();
  const data = useCustomFields();
  const { loading, tables, fieldsByTable, allowedTables } = data;

  const [filter, setFilter] = useState('');
  const [chosen, setSelected] = useState<string | null>(null);
  const [fieldDrawer, setFieldDrawer] = useState<{
    form: FieldForm;
    editing: FieldRow | null;
  } | null>(null);
  const [tableModal, setTableModal] = useState<{
    form: TableForm;
    editing: string | null;
  } | null>(null);
  const [packsOpen, setPacksOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Sin selección, o si la elegida ya no existe, se abre la primera que haya.
  const exists = (name: string | null) =>
    !!name && (fieldsByTable.has(name) || tables.some((table) => table.tableName === name));
  const selected = exists(chosen)
    ? chosen
    : (tables[0]?.tableName ?? [...fieldsByTable.keys()].sort()[0] ?? null);

  const selectedTable = tables.find((table) => table.tableName === selected) ?? null;
  const selectedFields = (selected && fieldsByTable.get(selected)) || [];
  const tableLabel = (tableName: string) =>
    tables.find((table) => table.tableName === tableName)?.label || tableName;

  const openNewField = (tableName = selected ?? allowedTables[0] ?? '') =>
    setFieldDrawer({
      form: defaultFieldForm(tableName, data.nextOrder(tableName)),
      editing: null,
    });

  const clone = async (field: FieldRow) => {
    const target = await popup.show<string>({
      title: t('settingsFields.cloneTitle', { name: field.label }),
      subtitle: t('settingsFields.cloneSubtitle'),
      maxWidth: 'sm',
      render: (close) => (
        <CloneTargetForm
          tables={allowedTables.filter((name) => name !== field.tableName)}
          tableLabel={tableLabel}
          onCancel={() => close()}
          onConfirm={(name) => close(name)}
        />
      ),
    });
    if (target) await data.cloneField(field, target);
  };

  const removeSelectedTable = async () => {
    if (selectedTable && (await data.removeTable(selectedTable))) setSelected(null);
  };

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('settingsFields.title')}
        subtitle={t('settingsFields.subtitle')}
        icon={<Wrench size={18} />}
        size="sm"
        divider
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DropdownMenu
              align="end"
              aria-label={t('settingsFields.more')}
              items={[
                {
                  label: t('settingsFields.packs'),
                  icon: <Package size={14} />,
                  onClick: () => setPacksOpen(true),
                },
                {
                  label: t('settingsFields.export'),
                  icon: <Download size={14} />,
                  onClick: () => void data.exportAll(),
                },
                {
                  label: t('settingsFields.import'),
                  icon: <Upload size={14} />,
                  onClick: () => setImportOpen(true),
                },
              ]}
            >
              <Button type="button" variant="ghost" aria-label={t('settingsFields.more')}>
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenu>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTableModal({ form: defaultTableForm(), editing: null })}
              className="gap-2"
            >
              <TableIcon size={14} /> {t('settingsFields.newTable')}
            </Button>
            <Button type="button" onClick={() => openNewField()} className="gap-2">
              <Plus size={14} /> {t('settingsFields.newField')}
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 items-start">
          <TablesPane
            tables={tables}
            fieldsByTable={fieldsByTable}
            filter={filter}
            onFilterChange={setFilter}
            selected={selected}
            onSelect={setSelected}
            onCreateTable={() => setTableModal({ form: defaultTableForm(), editing: null })}
          />
          {selected ? (
            <TablePanel
              tableName={selected}
              table={selectedTable}
              fields={selectedFields}
              onAddField={() => openNewField(selected)}
              onEditField={(field) =>
                setFieldDrawer({ form: fieldFormFromRow(field), editing: field })
              }
              onCloneField={clone}
              onRemoveField={data.removeField}
              onReorder={(next) => void data.reorderFields(selected, next)}
              onOpenRecords={() => openTab(`/u/${selected.replace(/^pt_/, '')}`)}
              onOpenTemplates={() => openTab('/document-templates')}
              onEditTable={() =>
                selectedTable &&
                setTableModal({ form: tableFormFromRow(selectedTable), editing: selected })
              }
              onRemoveTable={removeSelectedTable}
            />
          ) : (
            <Card>
              <EmptyState
                icon={<Wrench size={18} />}
                title={t('settingsFields.noFieldsTitle')}
                hint={t('settingsFields.noFieldsHint')}
                action={
                  <Button onClick={() => setPacksOpen(true)} variant="secondary" className="gap-2">
                    <Package size={14} /> {t('settingsFields.packs')}
                  </Button>
                }
              />
            </Card>
          )}
        </div>
      )}

      {fieldDrawer && (
        <FieldDrawer
          initial={fieldDrawer.form}
          editing={fieldDrawer.editing}
          allowedTables={allowedTables}
          tableLabel={tableLabel}
          onClose={() => setFieldDrawer(null)}
          onSave={async (form, isEdit) => {
            const saved = await data.saveField(form, isEdit);
            if (saved) setSelected(form.tableName);
            return saved;
          }}
        />
      )}

      {tableModal && (
        <TableModal
          initial={tableModal.form}
          editing={tableModal.editing}
          fields={tableModal.editing ? (fieldsByTable.get(tableModal.editing) ?? []) : []}
          onClose={() => setTableModal(null)}
          onSave={async (form, editing) => {
            const saved = await data.saveTable(form, editing);
            if (saved) setSelected(saved);
            return !!saved;
          }}
        />
      )}

      <Modal
        isOpen={packsOpen}
        onClose={() => setPacksOpen(false)}
        title={t('settingsFields.packsTitle')}
        subtitle={t('settingsFields.packsSubtitle')}
        size="xl"
        hideCancel
      >
        <List variant="cards" staggerAnimation={false}>
          {data.packs.map((pack) => (
            <List.Item
              key={pack.id}
              icon={<Package size={16} />}
              title={pack.label}
              description={t('settingsFields.packFields', {
                count: pack.count,
                fields: pack.fields.map((f: any) => `${f.tableName}.${f.fieldName}`).join(', '),
              })}
              trailing={
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await data.installPack(pack.id)) setPacksOpen(false);
                  }}
                >
                  {t('settingsFields.install')}
                </Button>
              }
            />
          ))}
        </List>
      </Modal>

      <Modal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('settingsFields.importTitle')}
        subtitle={t('settingsFields.importSubtitle')}
        size="md"
        hideCancel
      >
        <FileDropzone
          accept=".json"
          label={t('settingsFields.importDrop')}
          icon={<Upload size={18} />}
          onFiles={async (files) => {
            if (files[0] && (await data.importFile(files[0]))) setImportOpen(false);
          }}
        />
      </Modal>
    </div>
  );
};

/** Cuerpo del popup «clonar campo a otra tabla». */
const CloneTargetForm: React.FC<{
  tables: string[];
  tableLabel: (tableName: string) => string;
  onCancel: () => void;
  onConfirm: (table: string) => void;
}> = ({ tables, tableLabel, onCancel, onConfirm }) => {
  const { t } = useI18n();
  const [target, setTarget] = useState(tables[0] || '');
  return (
    <div className="space-y-4">
      <Field label={t('settingsFields.targetTable')}>
        <SearchableSelect
          options={tables.map((name) => ({ value: name, label: tableLabel(name) }))}
          value={target}
          onChange={setTarget}
          placeholder={t('settingsFields.chooseOne')}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t('settingsFields.cancel')}
        </Button>
        <Button type="button" onClick={() => onConfirm(target)} disabled={!target}>
          {t('settingsFields.clone')}
        </Button>
      </div>
    </div>
  );
};

export default CustomFields;
