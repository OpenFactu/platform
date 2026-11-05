import React, { useEffect, useState } from 'react';
import {
  Accordion,
  Button,
  Checkbox,
  Drawer,
  Field,
  FormGrid,
  FormRow,
  FormSection,
  Input,
  NumberInput,
  SearchableSelect,
  SegmentedControl,
  ToggleGroup,
  useToast,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { linkedObjectsApi } from '@/components/plugin-fields/linkedObjects';
import { OptionsEditor } from './OptionsEditor';
import {
  FIELD_TYPES,
  NUMERIC_TYPES,
  OPTION_TYPES,
  ROLE_OPTIONS,
  SURFACES,
  TEXT_TYPES,
  fieldFormError,
  technicalNameFrom,
  type FieldForm,
  type FieldRow,
} from './fieldForm';

interface Props {
  /** Valores con los que abrir: se monta de nuevo cada vez que se abre. */
  initial: FieldForm;
  editing: FieldRow | null;
  allowedTables: string[];
  /** Nombre visible de cada tabla propia, para el selector de tabla. */
  tableLabel: (tableName: string) => string;
  onClose: () => void;
  onSave: (form: FieldForm, isEdit: boolean) => Promise<boolean>;
}

const Check: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-fg-body">
    <Checkbox checked={checked} onChange={onChange} />
    {label}
  </label>
);

/** Crear o editar un campo: lo imprescindible a la vista y el resto en secciones plegadas. */
export const FieldDrawer: React.FC<Props> = ({
  initial,
  editing,
  allowedTables,
  tableLabel,
  onClose,
  onSave,
}) => {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<FieldForm>(initial);
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!editing;

  const set = (change: Partial<FieldForm>) => setForm((prev) => ({ ...prev, ...change }));

  const submit = async () => {
    const error = fieldFormError(form);
    if (error) {
      toast.error(t(`settingsFields.${error}`));
      return;
    }
    setSubmitting(true);
    try {
      if (await onSave(form, isEdit)) onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const tableOptions = allowedTables.map((name) => ({ value: name, label: tableLabel(name) }));
  const [linkOptions, setLinkOptions] = useState<Array<{ value: string; label: string }>>([]);
  useEffect(() => {
    let alive = true;
    linkedObjectsApi
      .list()
      .then((objects) => {
        if (alive) setLinkOptions(objects.map((o) => ({ value: o.id, label: o.label })));
      })
      .catch(() => {
        if (alive) setLinkOptions([]);
      });
    return () => {
      alive = false;
    };
  }, []);
  // Decimales admitidos por los límites según el tipo: entero 0, porcentaje 2, resto 4.
  const boundPrecision = form.fieldType === 'INTEGER' ? 0 : form.fieldType === 'PERCENT' ? 2 : 4;
  const typeHint = FIELD_TYPES.find((type) => type.value === form.fieldType)?.key;
  const roleItems = ROLE_OPTIONS.map((role) => ({ value: role, label: role }));

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? t('settingsFields.editField') : t('settingsFields.newCustomField')}
      subtitle={isEdit ? editing?.fieldName : undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('settingsFields.cancel')}
          </Button>
          <Button onClick={submit} isLoading={submitting}>
            {isEdit ? t('settingsFields.saveChanges') : t('settingsFields.createField')}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <FormSection>
          <FormGrid columns={2}>
            <Field label={t('settingsFields.visibleLabel')} required>
              <Input
                autoFocus={!isEdit}
                value={form.label}
                placeholder={t('settingsFields.visibleLabelPlaceholder')}
                onChange={(e) => {
                  const label = e.target.value;
                  set(
                    form.fieldNameTouched
                      ? { label }
                      : { label, fieldName: technicalNameFrom(label) },
                  );
                }}
              />
            </Field>
            <Field
              label={t('settingsFields.type')}
              hint={typeHint ? t(`settingsFields.types.${typeHint}.hint`) : undefined}
            >
              <SearchableSelect
                options={FIELD_TYPES.map((type) => ({
                  value: type.value,
                  label: t(`settingsFields.types.${type.key}.label`),
                  secondaryLabel: t(`settingsFields.types.${type.key}.hint`),
                }))}
                value={form.fieldType}
                onChange={(fieldType) => set({ fieldType })}
                disabled={isEdit}
              />
            </Field>
            <Field label={t('settingsFields.table')}>
              <SearchableSelect
                options={tableOptions}
                value={form.tableName}
                onChange={(tableName) => set({ tableName })}
                disabled={isEdit}
                placeholder={t('settingsFields.chooseOne')}
              />
            </Field>
            <Field
              label={t('settingsFields.technicalName')}
              hint={isEdit ? undefined : t('settingsFields.technicalHint')}
            >
              <Input
                value={form.fieldName}
                disabled={isEdit}
                onChange={(e) => set({ fieldName: e.target.value, fieldNameTouched: true })}
              />
            </Field>
          </FormGrid>
        </FormSection>

        {OPTION_TYPES.includes(form.fieldType) && (
          <FormSection
            title={t('settingsFields.sections.options')}
            description={t('settingsFields.optionsHelp')}
          >
            <OptionsEditor value={form.options} onChange={(options) => set({ options })} />
          </FormSection>
        )}

        {form.fieldType === 'REFERENCE' && (
          <FormSection title={t('settingsFields.sections.reference')}>
            <Field label={t('settingsFields.targetObject')} hint={t('settingsFields.targetObjectHint')}>
              <SearchableSelect
                options={linkOptions}
                value={form.refObject}
                onChange={(refObject) => set({ refObject })}
                placeholder={t('settingsFields.chooseOne')}
                clearable
              />
            </Field>
          </FormSection>
        )}

        <FormSection title={t('settingsFields.sections.visibility')}>
          <div className="space-y-3">
            <ToggleGroup
              type="multiple"
              aria-label={t('settingsFields.visibleInLabel')}
              items={SURFACES.map((surface) => ({
                value: surface,
                label: t(`settingsFields.visibleIn.${surface}`),
              }))}
              value={form.visibleIn}
              onChange={(visibleIn) => set({ visibleIn })}
            />
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Check
                label={t('settingsFields.requiredOnSave')}
                checked={form.required}
                onChange={(required) => set({ required })}
              />
              <Check
                label={t('settingsFields.readOnly')}
                checked={form.readOnly}
                onChange={(readOnly) => set({ readOnly })}
              />
              <Check
                label={t('settingsFields.listColumn')}
                checked={form.showInList}
                onChange={(showInList) => set({ showInList })}
              />
            </div>
          </div>
        </FormSection>

        <Accordion
          type="multiple"
          items={[
            {
              key: 'appearance',
              title: t('settingsFields.sections.appearance'),
              content: (
                <FormGrid columns={2}>
                  <Field label={t('settingsFields.section')}>
                    <Input
                      value={form.section}
                      onChange={(e) => set({ section: e.target.value })}
                      placeholder={t('settingsFields.sectionPlaceholder')}
                    />
                  </Field>
                  <Field label={t('settingsFields.width')}>
                    <SegmentedControl
                      aria-label={t('settingsFields.width')}
                      fullWidth
                      options={[
                        { value: 'third', label: '1/3' },
                        { value: 'half', label: '1/2' },
                        { value: 'full', label: t('settingsFields.widths.full') },
                      ]}
                      value={form.width}
                      onChange={(width) => set({ width: width as FieldForm['width'] })}
                    />
                  </Field>
                  <Field label={t('settingsFields.placeholder')}>
                    <Input
                      value={form.placeholder}
                      onChange={(e) => set({ placeholder: e.target.value })}
                    />
                  </Field>
                  <Field label={t('settingsFields.defaultValue')}>
                    <Input
                      value={form.defaultValue}
                      onChange={(e) => set({ defaultValue: e.target.value })}
                    />
                  </Field>
                  <FormRow full>
                    <Field label={t('settingsFields.helpText')}>
                      <Input
                        value={form.helpText}
                        onChange={(e) => set({ helpText: e.target.value })}
                        placeholder={t('settingsFields.helpTextPlaceholder')}
                      />
                    </Field>
                  </FormRow>
                </FormGrid>
              ),
            },
            {
              key: 'validation',
              title: t('settingsFields.sections.validation'),
              content: (
                <div className="space-y-3">
                  {NUMERIC_TYPES.includes(form.fieldType) && (
                    <FormGrid columns={2}>
                      <Field label={t('settingsFields.min')}>
                        <NumberInput
                          value={form.min}
                          onChange={(min) => set({ min })}
                          precision={boundPrecision}
                          placeholder={t('settingsFields.noLimit')}
                        />
                      </Field>
                      <Field label={t('settingsFields.max')}>
                        <NumberInput
                          value={form.max}
                          onChange={(max) => set({ max })}
                          precision={boundPrecision}
                          placeholder={t('settingsFields.noLimit')}
                        />
                      </Field>
                    </FormGrid>
                  )}
                  {TEXT_TYPES.includes(form.fieldType) && (
                    <FormGrid columns={2}>
                      <Field label={t('settingsFields.minLength')}>
                        <NumberInput
                          value={form.minLength}
                          onChange={(minLength) => set({ minLength })}
                          min={0}
                          allowNegative={false}
                          placeholder={t('settingsFields.noLimit')}
                        />
                      </Field>
                      <Field label={t('settingsFields.maxLength')}>
                        <NumberInput
                          value={form.maxLength}
                          onChange={(maxLength) => set({ maxLength })}
                          min={0}
                          allowNegative={false}
                          placeholder={t('settingsFields.noLimit')}
                        />
                      </Field>
                      <FormRow full>
                        <Field label={t('settingsFields.pattern')}>
                          <Input
                            value={form.pattern}
                            onChange={(e) => set({ pattern: e.target.value })}
                            placeholder="^[A-Z]{3}-\d+$"
                          />
                        </Field>
                      </FormRow>
                    </FormGrid>
                  )}
                  <Check
                    label={t('settingsFields.unique')}
                    checked={form.unique}
                    onChange={(unique) => set({ unique })}
                  />
                </div>
              ),
            },
            {
              key: 'permissions',
              title: t('settingsFields.sections.permissions'),
              content: (
                <div className="space-y-3">
                  <Field label={t('settingsFields.canRead')}>
                    <ToggleGroup
                      type="multiple"
                      aria-label={t('settingsFields.canRead')}
                      items={roleItems}
                      value={form.readRoles}
                      onChange={(readRoles) => set({ readRoles })}
                    />
                  </Field>
                  <Field
                    label={t('settingsFields.canWrite')}
                    hint={t('settingsFields.permissionsHelp')}
                  >
                    <ToggleGroup
                      type="multiple"
                      aria-label={t('settingsFields.canWrite')}
                      items={roleItems}
                      value={form.writeRoles}
                      onChange={(writeRoles) => set({ writeRoles })}
                    />
                  </Field>
                </div>
              ),
            },
          ]}
        />
      </div>
    </Drawer>
  );
};
