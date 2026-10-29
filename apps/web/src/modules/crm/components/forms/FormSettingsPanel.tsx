import React from 'react';
import { Input, Select, Switch, Textarea } from '@openfactu/ui';
import type { CrmForm, FormSettings } from '../../domain/forms';
import { useCrmSettings, useStages } from '../../hooks/useCrmData';
import { OwnerSelect } from '../OwnerSelect';

interface Props {
  form: CrmForm;
  set: (patch: Partial<CrmForm>) => void;
  disabled?: boolean;
}

/** Textos del formulario, su enlace y qué hace el CRM con cada respuesta. */
export const FormSettingsPanel: React.FC<Props> = ({ form, set, disabled }) => {
  const { stages } = useStages();
  const { settings: crm } = useCrmSettings();
  const s = form.settings ?? {};
  const setSettings = (patch: Partial<FormSettings>) => set({ settings: { ...s, ...patch } });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nombre interno"
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          disabled={disabled}
        />
        <Input
          label="Enlace"
          helperText="Parte final de la dirección pública."
          value={form.slug}
          onChange={(e) => set({ slug: e.target.value })}
          disabled={disabled}
        />
        <Input
          label="Título que ve quien responde"
          value={form.title ?? ''}
          onChange={(e) => set({ title: e.target.value })}
          disabled={disabled}
        />
        <Input
          label="Texto del botón"
          value={s.submitLabel ?? ''}
          placeholder="Enviar"
          onChange={(e) => setSettings({ submitLabel: e.target.value || undefined })}
          disabled={disabled}
        />
      </div>
      <Textarea
        label="Introducción"
        rows={3}
        value={form.intro ?? ''}
        onChange={(e) => set({ intro: e.target.value })}
        disabled={disabled}
      />
      <Textarea
        label="Mensaje al enviar"
        rows={2}
        value={s.successMessage ?? ''}
        placeholder="¡Gracias! Hemos recibido tu respuesta."
        onChange={(e) => setSettings({ successMessage: e.target.value || undefined })}
        disabled={disabled}
      />
      <Switch
        label="Formulario activo (acepta respuestas)"
        checked={form.isActive}
        onChange={(isActive) => set({ isActive })}
        disabled={disabled}
      />

      {form.kind === 'form' && (
        <div className="space-y-4 pt-4 border-t border-border-subtle">
          <Switch
            label="Crear un prospecto con cada respuesta"
            checked={!!s.createLead}
            onChange={(createLead) => setSettings({ createLead })}
            disabled={disabled}
          />
          {s.createLead && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                label="Etapa"
                options={[
                  { value: '', label: 'La primera abierta' },
                  ...stages
                    .filter((st) => st.kind === 'open')
                    .map((st) => ({ value: st.id, label: st.name })),
                ]}
                value={s.stageId ?? ''}
                onChange={(v) => setSettings({ stageId: v || undefined })}
                disabled={disabled}
              />
              <OwnerSelect
                value={s.ownerUserId}
                onChange={(v) => setSettings({ ownerUserId: v ?? undefined })}
                placeholder="El responsable por defecto"
                disabled={disabled}
              />
              <Select
                label="Origen"
                options={[
                  { value: '', label: 'Web' },
                  ...crm.sources.map((src) => ({ value: src, label: src })),
                ]}
                value={s.source ?? ''}
                onChange={(v) => setSettings({ source: v || undefined })}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
