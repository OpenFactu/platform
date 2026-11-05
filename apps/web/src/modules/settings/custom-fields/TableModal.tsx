import React, { useState } from 'react';
import {
  ChoiceCards,
  Field,
  FormGrid,
  FormRow,
  Input,
  Modal,
  SearchableSelect,
  Select,
  Textarea,
  useToast,
} from '@openfactu/ui';
import { Database, FileText } from 'lucide-react';
import { PluginIcon } from '@/components/PluginIcon';
import { useI18n } from '@/i18n/I18nContext';
import {
  MENU_MODULES,
  TABLE_ICONS,
  technicalNameFrom,
  type FieldRow,
  type TableForm,
} from './fieldForm';

interface Props {
  /** Valores con los que abrir: se monta de nuevo cada vez que se abre. */
  initial: TableForm;
  /** Nombre de la tabla que se edita; `null` al crear. */
  editing: string | null;
  fields: FieldRow[];
  onClose: () => void;
  onSave: (form: TableForm, editing: string | null) => Promise<boolean>;
}

export const TableModal: React.FC<Props> = ({ initial, editing, fields, onClose, onSave }) => {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<TableForm>(initial);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editing;

  const set = (change: Partial<TableForm>) => setForm((prev) => ({ ...prev, ...change }));

  const submit = async () => {
    if (!form.name) {
      toast.error(t('settingsFields.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      if (await onSave(form, editing)) onClose();
    } finally {
      setSaving(false);
    }
  };

  // Un icono guardado antes puede no estar entre los que se ofrecen ahora.
  const icons = TABLE_ICONS.includes(form.iconName) ? TABLE_ICONS : [form.iconName, ...TABLE_ICONS];

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={isEdit ? t('settingsFields.editTable') : t('settingsFields.newTable')}
      subtitle={isEdit ? editing : t('settingsFields.newTableSubtitle')}
      cancelLabel={t('settingsFields.cancel')}
      primaryAction={{
        label: isEdit ? t('settingsFields.saveChanges') : t('settingsFields.createTable'),
        onClick: submit,
        isLoading: saving,
      }}
    >
      <FormGrid columns={2}>
        <FormRow full>
          <ChoiceCards
            label={t('settingsFields.tableType')}
            value={form.kind}
            onChange={(kind) => set({ kind })}
            options={[
              {
                value: 'master',
                title: t('settingsFields.kinds.master'),
                description: t('settingsFields.kindMasterHint'),
                icon: <Database size={16} />,
              },
              {
                value: 'document',
                title: t('settingsFields.kinds.document'),
                description: t('settingsFields.kindDocumentHint'),
                icon: <FileText size={16} />,
              },
            ]}
          />
        </FormRow>
        <Field label={t('settingsFields.visibleLabel')} required>
          <Input
            autoFocus={!isEdit}
            value={form.label}
            placeholder={t('settingsFields.tableLabelPlaceholder')}
            onChange={(e) => {
              const label = e.target.value;
              set(form.nameTouched ? { label } : { label, name: technicalNameFrom(label) });
            }}
          />
        </Field>
        <Field
          label={t('settingsFields.technicalName')}
          hint={isEdit ? undefined : t('settingsFields.technicalHint')}
        >
          <Input
            value={form.name}
            disabled={isEdit}
            onChange={(e) => set({ name: e.target.value, nameTouched: true })}
          />
        </Field>
        <Field label={t('settingsFields.icon')}>
          <SearchableSelect
            options={icons.map((name) => ({
              value: name,
              label: name,
              icon: <PluginIcon iconName={name} size={14} />,
            }))}
            value={form.iconName}
            onChange={(iconName) => set({ iconName })}
          />
        </Field>
        <Field label={t('settingsFields.menuModule')}>
          <Select
            ariaLabel={t('settingsFields.menuModule')}
            options={[
              { value: '', label: t('settingsFields.menu.custom') },
              ...MENU_MODULES.map((value) => ({
                value,
                label: t(`settingsFields.menu.${value}`),
              })),
            ]}
            value={form.menuModule}
            onChange={(menuModule) => set({ menuModule })}
          />
        </Field>
        {isEdit && (
          <FormRow full>
            <Field
              label={t('settingsFields.identifierField')}
              hint={t('settingsFields.identifierFieldHint')}
            >
              <SearchableSelect
                options={fields.map((field) => ({ value: field.fieldName, label: field.label }))}
                value={form.displayField}
                onChange={(displayField) => set({ displayField })}
                placeholder={t('settingsFields.identifierFieldNone')}
                clearable
              />
            </Field>
          </FormRow>
        )}
        <FormRow full>
          <Field label={t('settingsFields.description')}>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder={t('settingsFields.optionalCap')}
            />
          </Field>
        </FormRow>
      </FormGrid>
    </Modal>
  );
};
