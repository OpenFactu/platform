import { useI18n } from '@/i18n/I18nContext';
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
  const { t } = useI18n();
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
      toast.success(t('crm.settings.saved'));
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('crm.settings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title={t('crm.nav.settingsTitle')}
        subtitle={t('crm.settings.subtitle')}
        icon={<Settings size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button type="button" size="sm" onClick={save} isLoading={saving} disabled={!form}>
              <Save size={14} /> {t('crm.common.save')}
            </Button>
          )
        }
      />
      {form && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <Card title={t('crm.settings.lostReasons')} subtitle={t('crm.settings.lostReasonsHint')}>
            <StringListEditor
              label={t('crm.settings.reasons')}
              values={form.lostReasons}
              onChange={(lostReasons) => set({ lostReasons })}
              placeholder={t('crm.settings.newReason')}
              disabled={disabled}
            />
          </Card>
          <Card title={t('crm.settings.sources')} subtitle={t('crm.settings.sourcesHint')}>
            <div className="space-y-3">
              <StringListEditor
                label={t('crm.settings.sources')}
                values={form.sources}
                onChange={(sources) => set({ sources })}
                placeholder={t('crm.settings.newSource')}
                disabled={disabled}
              />
              <Switch
                label={t('crm.settings.sourceRequired')}
                checked={form.sourceRequired}
                onChange={(sourceRequired) => set({ sourceRequired })}
                disabled={disabled}
              />
            </div>
          </Card>
          <Card title={t('crm.settings.followUp')} subtitle={t('crm.settings.followUpHint')}>
            <div className="space-y-4">
              <OwnerSelect
                label={t('crm.settings.defaultOwner')}
                value={form.defaultOwnerUserId}
                onChange={(v) => set({ defaultOwnerUserId: v ?? '' })}
                placeholder={t('crm.settings.nobody')}
                disabled={disabled}
              />
              <NumberInput
                label={t('crm.settings.staleDays')}
                value={form.staleDays}
                onChange={(v) => set({ staleDays: v ?? 14 })}
                min={1}
                disabled={disabled}
              />
              <NumberInput
                label={t('crm.settings.boardClosedDays')}
                helperText={t('crm.settings.boardClosedDaysHint')}
                value={form.boardClosedDays}
                onChange={(v) => set({ boardClosedDays: v ?? 30 })}
                min={0}
                disabled={disabled}
              />
              <Switch
                label={t('crm.settings.dormantEnabled')}
                checked={form.dormantEnabled}
                onChange={(dormantEnabled) => set({ dormantEnabled })}
                disabled={disabled}
              />
              {form.dormantEnabled && (
                <NumberInput
                  label={t('crm.settings.dormantDays')}
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
