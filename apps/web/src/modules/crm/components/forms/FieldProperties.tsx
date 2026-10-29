import React from 'react';
import { EmptyState, Input, Select, Switch, Textarea } from '@openfactu/ui';
import { MousePointerClick } from 'lucide-react';
import {
  CHOICE_TYPES,
  FIELD_TYPE_LABEL,
  MAP_TARGET_LABEL,
  type FieldType,
  type FormField,
  type FormKind,
  type MapTarget,
} from '../../domain/forms';
import { StringListEditor } from '../StringListEditor';

interface Props {
  field: FormField | null;
  kind: FormKind;
  onChange: (patch: Partial<FormField>) => void;
  disabled?: boolean;
}

const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABEL) as FieldType[]).map((t) => ({
  value: t,
  label: FIELD_TYPE_LABEL[t],
}));
const MAP_OPTIONS = [
  { value: '', label: '— no se guarda en el CRM —' },
  ...(Object.keys(MAP_TARGET_LABEL) as MapTarget[]).map((m) => ({
    value: m,
    label: MAP_TARGET_LABEL[m],
  })),
];

/** Propiedades de la pregunta seleccionada. */
export const FieldProperties: React.FC<Props> = ({ field, kind, onChange, disabled }) => {
  if (!field)
    return (
      <EmptyState
        variant="compact"
        icon={<MousePointerClick size={18} />}
        title="Elige una pregunta"
        hint="Sus propiedades aparecen aquí."
      />
    );
  const isChoice = CHOICE_TYPES.includes(field.type);
  return (
    <div className="space-y-4">
      <Select
        label="Tipo"
        options={TYPE_OPTIONS}
        value={field.type}
        onChange={(v) => {
          const type = v as FieldType;
          const choice = CHOICE_TYPES.includes(type);
          onChange({
            type,
            options: choice
              ? field.options?.length
                ? field.options
                : ['Opción 1', 'Opción 2']
              : undefined,
            required: type === 'section' ? undefined : field.required,
          });
        }}
        disabled={disabled}
      />
      <Input
        label={field.type === 'section' ? 'Título de la sección' : 'Pregunta'}
        value={field.label}
        onChange={(e) => onChange({ label: e.target.value })}
        disabled={disabled}
      />
      <Textarea
        label="Ayuda"
        rows={2}
        value={field.help ?? ''}
        onChange={(e) => onChange({ help: e.target.value || undefined })}
        placeholder="Texto opcional bajo la pregunta"
        disabled={disabled}
      />
      {field.type !== 'section' && (
        <Switch
          label="Obligatoria"
          checked={!!field.required}
          onChange={(required) => onChange({ required: required || undefined })}
          disabled={disabled}
        />
      )}
      {isChoice && (
        <StringListEditor
          label="Opciones"
          values={field.options ?? []}
          onChange={(options) => onChange({ options })}
          placeholder="Nueva opción"
          disabled={disabled}
        />
      )}
      {kind === 'form' && field.type !== 'section' && (
        <Select
          label="Guardar en el CRM como"
          helperText="Rellena ese dato del prospecto que se crea con cada respuesta."
          options={MAP_OPTIONS}
          value={field.mapTo ?? ''}
          onChange={(v) => onChange({ mapTo: (v || undefined) as MapTarget | undefined })}
          disabled={disabled}
        />
      )}
    </div>
  );
};
