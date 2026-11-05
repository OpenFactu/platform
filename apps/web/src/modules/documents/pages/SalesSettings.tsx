import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Input,
  Loader,
  NumberInput,
  PageHeader,
  Select,
  Switch,
  Textarea,
  useToast,
} from '@openfactu/ui';
import { Plus, Settings, Trash2 } from 'lucide-react';
import { FloatingSaveButton, HeaderSaveButton } from '@/components/FloatingSaveButton';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { salesSettingsApi } from '../api/salesApi';
import type { CreditMode, DunningLevel, SalesSettings as Settings_ } from '../domain/sales';

/** Lo que cada empresa decide sobre el crédito de sus clientes y cómo reclama lo que le deben. */
export const SalesSettings: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/sales/settings']?.write;
  const [settings, setSettings] = useState<Settings_ | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    salesSettingsApi
      .get()
      .then(setSettings)
      .catch((e) => toast.error(e instanceof Error ? e.message : undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) {
    return (
      <div className="p-12 flex justify-center">
        <Loader />
      </div>
    );
  }

  const { dunning } = settings;
  const setDunning = (patch: Partial<Settings_['dunning']>) =>
    setSettings({ ...settings, dunning: { ...dunning, ...patch } });
  const setLevel = (index: number, patch: Partial<DunningLevel>) =>
    setDunning({
      levels: dunning.levels.map((level, i) => (i === index ? { ...level, ...patch } : level)),
    });
  const addLevel = () => {
    const last = dunning.levels[dunning.levels.length - 1];
    setDunning({
      levels: [...dunning.levels, { days: (last?.days ?? 0) + 30, subject: '', body: '' }],
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      setSettings(await salesSettingsApi.save(settings));
      toast.success(t('doc.salesSettings.saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="p-4 pb-24 max-md:pb-48 space-y-4 animate-in fade-in duration-300"
      onSubmit={save}
    >
      <PageHeader
        title={t('doc.salesSettings.title')}
        subtitle={t('doc.salesSettings.subtitle')}
        icon={<Settings size={18} />}
        size="sm"
        actions={
          canWrite && <HeaderSaveButton label={t('doc.salesSettings.save')} saving={saving} />
        }
      />

      <Card title={t('doc.salesSettings.creditTitle')} subtitle={t('doc.salesSettings.creditHint')}>
        <div className="space-y-2 max-w-md">
          <Select
            label={t('doc.salesSettings.creditMode')}
            value={settings.creditMode}
            onChange={(value) => setSettings({ ...settings, creditMode: value as CreditMode })}
            options={(['warn', 'block', 'off'] as CreditMode[]).map((mode) => ({
              value: mode,
              label: t(`doc.salesSettings.mode.${mode}`),
            }))}
            disabled={!canWrite}
          />
          <p className="text-xs text-fg-muted">
            {t(`doc.salesSettings.modeHint.${settings.creditMode}`)}
          </p>
        </div>
      </Card>

      <Card
        title={t('doc.salesSettings.dunningTitle')}
        subtitle={t('doc.salesSettings.dunningHint')}
        headerAction={
          canWrite && (
            <Button type="button" variant="secondary" size="sm" onClick={addLevel}>
              <Plus size={14} /> {t('doc.salesSettings.addLevel')}
            </Button>
          )
        }
      >
        <div className="space-y-4">
          {dunning.levels.map((level, index) => (
            <div key={index} className="rounded-lg border border-border-subtle p-4 space-y-3">
              <div className="flex items-end gap-3">
                <NumberInput
                  label={t('doc.salesSettings.levelDays', { level: index + 1 })}
                  value={level.days}
                  min={0}
                  onChange={(value) => setLevel(index, { days: Number(value) || 0 })}
                  disabled={!canWrite}
                />
                {canWrite && dunning.levels.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={t('doc.salesSettings.removeLevel')}
                    onClick={() =>
                      setDunning({ levels: dunning.levels.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </div>
              <Input
                label={t('doc.salesSettings.subject')}
                value={level.subject}
                placeholder={t('doc.salesSettings.factoryText')}
                onChange={(e) => setLevel(index, { subject: e.target.value })}
                disabled={!canWrite}
              />
              <Textarea
                label={t('doc.salesSettings.body')}
                value={level.body}
                rows={4}
                placeholder={t('doc.salesSettings.factoryText')}
                onChange={(e) => setLevel(index, { body: e.target.value })}
                disabled={!canWrite}
              />
            </div>
          ))}
          <p className="text-xs text-fg-muted">{t('doc.salesSettings.placeholders')}</p>
        </div>
      </Card>

      <Card title={t('doc.salesSettings.autoTitle')} subtitle={t('doc.salesSettings.autoHint')}>
        <div className="space-y-4 max-w-md">
          <Switch
            label={t('doc.salesSettings.autoSend')}
            checked={dunning.autoSend}
            onChange={(autoSend) => setDunning({ autoSend })}
            disabled={!canWrite}
          />
          <NumberInput
            label={t('doc.salesSettings.minDays')}
            value={dunning.minDaysBetween}
            min={1}
            max={365}
            onChange={(value) => setDunning({ minDaysBetween: Number(value) || 1 })}
            disabled={!canWrite}
          />
          {dunning.autoSend && <Alert tone="warning">{t('doc.salesSettings.autoWarning')}</Alert>}
        </div>
      </Card>

      {canWrite && <FloatingSaveButton label={t('doc.salesSettings.save')} saving={saving} />}
    </form>
  );
};

export default SalesSettings;
