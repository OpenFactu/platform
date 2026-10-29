import React, { useState } from 'react';
import { Button, Card, NumberInput, PageHeader, Switch, useToast } from '@openfactu/ui';
import { Save, Settings } from 'lucide-react';
import { crmSettingsApi } from '../api';
import type { CrmSettings as Settings_ } from '../domain/crm';
import { useCrmSettings } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { OwnerSelect } from '../components/OwnerSelect';
import { StringListEditor } from '../components/StringListEditor';

export const CrmSettings: React.FC = () => {
  const toast = useToast();
  const { canWrite } = useCrmPermissions('/crm/settings');
  const { settings, loading, refresh } = useCrmSettings();
  const [form, setForm] = useState<Settings_ | null>(null);
  const [saving, setSaving] = useState(false);

  // El formulario parte de lo guardado cada vez que llega del servidor.
  const [seen, setSeen] = useState<Settings_ | null>(null);
  if (!loading && settings !== seen) {
    setSeen(settings);
    setForm(settings);
  }

  const set = (patch: Partial<Settings_>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const disabled = !canWrite;

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await crmSettingsApi.update(form);
      toast.success('Ajustes del CRM guardados');
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Ajustes del CRM"
        subtitle="Catálogos y avisos que usan oportunidades y actividades"
        icon={<Settings size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={save} isLoading={saving} disabled={!form}>
              <Save size={14} /> Guardar
            </Button>
          )
        }
      />
      {form && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Card title="Motivos de pérdida" subtitle="Se piden al dar una oportunidad por perdida.">
            <StringListEditor
              label="Motivos"
              values={form.lostReasons}
              onChange={(lostReasons) => set({ lostReasons })}
              placeholder="Nuevo motivo"
              disabled={disabled}
            />
          </Card>
          <Card title="Orígenes" subtitle="De dónde llegan las oportunidades.">
            <div className="space-y-3">
              <StringListEditor
                label="Orígenes"
                values={form.sources}
                onChange={(sources) => set({ sources })}
                placeholder="Nuevo origen"
                disabled={disabled}
              />
              <Switch
                label="Exigir el origen al crear una oportunidad"
                checked={form.sourceRequired}
                onChange={(sourceRequired) => set({ sourceRequired })}
                disabled={disabled}
              />
            </div>
          </Card>
          <Card title="Seguimiento" subtitle="Responsable por defecto y avisos.">
            <div className="space-y-4">
              <OwnerSelect
                label="Responsable por defecto"
                value={form.defaultOwnerUserId}
                onChange={(v) => set({ defaultOwnerUserId: v ?? '' })}
                placeholder="— nadie —"
                disabled={disabled}
              />
              <NumberInput
                label="Días sin actividad para marcar una oportunidad como parada"
                value={form.staleDays}
                onChange={(v) => set({ staleDays: v ?? 14 })}
                min={1}
                disabled={disabled}
              />
              <NumberInput
                label="Días que una oportunidad ganada o perdida sigue en el tablero"
                helperText="Después solo se ve en la lista, filtrando por cerradas."
                value={form.boardClosedDays}
                onChange={(v) => set({ boardClosedDays: v ?? 30 })}
                min={0}
                disabled={disabled}
              />
              <Switch
                label="Avisar de clientes habituales que dejan de comprar"
                checked={form.dormantEnabled}
                onChange={(dormantEnabled) => set({ dormantEnabled })}
                disabled={disabled}
              />
              {form.dormantEnabled && (
                <NumberInput
                  label="Días sin comprar"
                  value={form.dormantDays}
                  onChange={(v) => set({ dormantDays: v ?? 90 })}
                  min={7}
                  disabled={disabled}
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CrmSettings;
