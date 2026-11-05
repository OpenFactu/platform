import React, { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  NumberInput,
  PasswordInput,
  SegmentedControl,
  Select,
  Spinner,
  Switch,
} from '@openfactu/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import {
  HANDOVERS,
  type MapProvider,
  type MapView,
  type NavigationApp,
  type PackageCheck,
  type ReasonKind,
  type Requirement,
} from '../domain/deliveryFlow';
import { MAP_PRESETS, OWN_SERVER, presetFields, presetOf } from '../domain/mapProviders';
import { OTHER_PROBLEM } from '../domain/stopProblems';
import { useCanEditLogistics } from '../hooks/useCanEditLogistics';
import { useDeliveryFlow } from '../hooks/useDeliveryFlow';

const PROVIDERS: MapProvider[] = ['standard', 'light', 'dark', 'mono', 'custom'];

const Choice: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0 flex-1 basis-56">
      <div className="text-sm font-semibold text-fg-default">{label}</div>
      {hint && <div className="text-xs text-fg-muted">{hint}</div>}
    </div>
    {children}
  </div>
);

/** Cómo reparte esta empresa: qué se le pide al conductor y qué mapa usa. */
export const DeliveryFlowTab: React.FC = () => {
  const { t } = useI18n();
  const canWrite = useCanEditLogistics();
  const form = useDeliveryFlow();
  const [newReason, setNewReason] = useState('');
  const [newKind, setNewKind] = useState<ReasonKind>('postpone');
  const { draft } = form;

  if (form.failed) return <Alert tone="danger">{t('logistics.common.error')}</Alert>;
  if (!draft) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  const checks = [
    { value: 'off', label: t('logistics.flow.off') },
    { value: 'check', label: t('logistics.flow.check') },
    { value: 'scan', label: t('logistics.flow.scan') },
  ];
  const requirements = [
    { value: 'off', label: t('logistics.flow.off') },
    { value: 'optional', label: t('logistics.flow.optional') },
    { value: 'required', label: t('logistics.flow.required') },
  ];
  const kinds = [
    { value: 'postpone', label: t('logistics.flow.postpone') },
    { value: 'incident', label: t('logistics.flow.incident') },
  ];

  return (
    <fieldset disabled={!canWrite} className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-sm text-fg-muted">{t('logistics.flow.intro')}</p>
        {canWrite && (
          <Button disabled={!form.dirty || form.saving || !!form.mapError} onClick={form.save}>
            {t('logistics.flow.save')}
          </Button>
        )}
      </div>

      <Card title={t('logistics.flow.sectionLoad')} bodyClassName="space-y-4 p-4">
        <Choice label={t('logistics.flow.loadOut')} hint={t('logistics.flow.loadOutHint')}>
          <SegmentedControl<string>
            size="sm"
            aria-label={t('logistics.flow.loadOut')}
            value={draft.loadOut}
            onChange={(loadOut) => form.set({ loadOut: loadOut as PackageCheck })}
            options={checks}
          />
        </Choice>
        <Switch
          checked={draft.loadOutRequired}
          disabled={draft.loadOut === 'off'}
          onChange={(loadOutRequired) => form.set({ loadOutRequired })}
          label={t('logistics.flow.loadOutRequired')}
        />
      </Card>

      <Card title={t('logistics.flow.sectionDeliver')} bodyClassName="space-y-4 p-4">
        <Choice label={t('logistics.flow.packageCheck')}>
          <SegmentedControl<string>
            size="sm"
            aria-label={t('logistics.flow.packageCheck')}
            value={draft.packageCheck}
            onChange={(packageCheck) => form.set({ packageCheck: packageCheck as PackageCheck })}
            options={checks}
          />
        </Choice>
        <Switch
          checked={draft.arrive}
          onChange={(arrive) => form.set({ arrive })}
          label={t('logistics.flow.arrive')}
        />
        <div className="space-y-2">
          <div className="text-sm font-semibold text-fg-default">
            {t('logistics.flow.handover')}
          </div>
          {HANDOVERS.map((option) => (
            <Checkbox
              key={option}
              checked={draft.handover.includes(option)}
              disabled={option === 'safePlace' && draft.photo === 'off'}
              onChange={(on) => form.toggleHandover(option, on)}
              label={t(`logistics.flow.handoverOptions.${option}`)}
            />
          ))}
        </div>
        <Choice label={t('logistics.flow.signature')}>
          <SegmentedControl<string>
            size="sm"
            aria-label={t('logistics.flow.signature')}
            value={draft.signature}
            onChange={(signature) => form.set({ signature: signature as Requirement })}
            options={requirements}
          />
        </Choice>
        <Switch
          checked={draft.allowDocument}
          disabled={draft.signature === 'off'}
          onChange={(allowDocument) => form.set({ allowDocument })}
          label={t('logistics.flow.allowDocument')}
        />
        <Choice label={t('logistics.flow.photo')}>
          <SegmentedControl<string>
            size="sm"
            aria-label={t('logistics.flow.photo')}
            value={draft.photo}
            onChange={(photo) => form.set({ photo: photo as Requirement })}
            options={requirements}
          />
        </Choice>
      </Card>

      <Card title={t('logistics.flow.sectionProblems')} bodyClassName="space-y-3 p-4">
        <p className="text-xs text-fg-muted">{t('logistics.flow.problemsHint')}</p>
        {draft.reasons.map((reason) => {
          const own = !!reason.label;
          const fixed = reason.id === OTHER_PROBLEM;
          return (
            <div key={reason.id} className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1 basis-48">
                <Switch
                  checked={reason.enabled}
                  disabled={fixed}
                  onChange={(enabled) => form.setReason(reason.id, { enabled })}
                  label={reason.label ?? t(`logistics.driver.problems.${reason.id}`)}
                />
              </div>
              {!fixed && (
                <SegmentedControl<string>
                  size="sm"
                  aria-label={t('logistics.flow.reasonKind')}
                  value={reason.kind}
                  onChange={(kind) => form.setReason(reason.id, { kind: kind as ReasonKind })}
                  options={kinds}
                />
              )}
              {own && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('logistics.flow.remove')}
                  onClick={() => form.removeReason(reason.id)}
                >
                  <Trash2 size={14} />
                </Button>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3">
          <Input
            containerClassName="min-w-0 flex-1 basis-48"
            label={t('logistics.flow.addReason')}
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />
          <SegmentedControl<string>
            size="sm"
            aria-label={t('logistics.flow.reasonKind')}
            value={newKind}
            onChange={(kind) => setNewKind(kind as ReasonKind)}
            options={kinds}
          />
          <Button
            variant="secondary"
            disabled={!newReason.trim()}
            onClick={() => {
              form.addReason(newReason.trim(), newKind);
              setNewReason('');
            }}
          >
            <Plus size={14} /> {t('logistics.flow.add')}
          </Button>
        </div>
      </Card>

      <Card title={t('logistics.flow.sectionStaging')} bodyClassName="p-4">
        <Switch
          checked={draft.stagingDrop}
          onChange={(stagingDrop) => form.set({ stagingDrop })}
          label={t('logistics.flow.stagingDrop')}
        />
      </Card>

      <Card title={t('logistics.flow.sectionMap')} bodyClassName="space-y-4 p-4">
        <Select
          label={t('logistics.flow.provider')}
          value={draft.map.provider}
          onChange={(provider) => form.setMap({ provider: provider as MapProvider })}
          options={PROVIDERS.map((value) => ({
            value,
            label: t(`logistics.flow.providers.${value}`),
          }))}
        />
        {draft.map.provider === 'custom' && (
          <>
            <Select
              label={t('logistics.flow.mapPreset')}
              value={presetOf(draft.map)}
              onChange={(id) => form.setMap(presetFields(id))}
              options={[
                ...MAP_PRESETS.map(({ id, name }) => ({ value: id, label: name })),
                { value: OWN_SERVER, label: t('logistics.flow.mapPresetOwn') },
              ]}
            />
            <Input
              label={t('logistics.flow.tileUrl')}
              requiredMark
              helperText={t('logistics.flow.tileUrlHint')}
              status={form.mapError === 'tileUrl' ? 'error' : undefined}
              value={draft.map.tileUrl}
              onChange={(e) => form.setMap({ tileUrl: e.target.value })}
            />
            <PasswordInput
              label={t('logistics.flow.apiKey')}
              helperText={t('logistics.flow.apiKeyHint')}
              autoComplete="new-password"
              status={
                form.mapError === 'apiKey' || form.mapError === 'keyHole' ? 'error' : undefined
              }
              value={draft.map.apiKey}
              onChange={(e) => form.setMap({ apiKey: e.target.value })}
            />
            {draft.map.apiKey && <Alert tone="info">{t('logistics.flow.apiKeyWarning')}</Alert>}
            <Input
              label={t('logistics.flow.satelliteUrl')}
              helperText={t('logistics.flow.satelliteUrlHint')}
              status={form.mapError === 'satelliteUrl' ? 'error' : undefined}
              value={draft.map.satelliteUrl}
              onChange={(e) => form.setMap({ satelliteUrl: e.target.value })}
            />
            <NumberInput
              label={t('logistics.flow.maxZoom')}
              helperText={t('logistics.flow.maxZoomHint')}
              min={1}
              max={19}
              value={draft.map.maxZoom}
              onChange={(maxZoom) => form.setMap({ maxZoom })}
            />
            <Input
              label={t('logistics.flow.attribution')}
              value={draft.map.attribution}
              onChange={(e) => form.setMap({ attribution: e.target.value })}
            />
            {form.mapError && (
              <Alert tone="warning">{t(`logistics.flow.mapErrors.${form.mapError}`)}</Alert>
            )}
          </>
        )}
        <Switch
          checked={draft.map.satellite}
          onChange={(satellite) =>
            form.setMap({
              satellite,
              defaultStyle: satellite ? draft.map.defaultStyle : 'standard',
            })
          }
          label={t('logistics.flow.satellite')}
        />
        {draft.map.satellite && (
          <Choice label={t('logistics.flow.defaultStyle')}>
            <SegmentedControl<string>
              size="sm"
              aria-label={t('logistics.flow.defaultStyle')}
              value={draft.map.defaultStyle}
              onChange={(defaultStyle) => form.setMap({ defaultStyle: defaultStyle as MapView })}
              options={[
                { value: 'standard', label: t('logistics.flow.styles.standard') },
                { value: 'satellite', label: t('logistics.flow.styles.satellite') },
              ]}
            />
          </Choice>
        )}
        <Choice label={t('logistics.flow.navigationApp')} hint={t('logistics.flow.navigationHint')}>
          <SegmentedControl<string>
            size="sm"
            aria-label={t('logistics.flow.navigationApp')}
            value={draft.map.navigationApp}
            onChange={(navigationApp) =>
              form.setMap({ navigationApp: navigationApp as NavigationApp })
            }
            options={[
              { value: 'google', label: t('logistics.flow.apps.google') },
              { value: 'waze', label: t('logistics.flow.apps.waze') },
              { value: 'apple', label: t('logistics.flow.apps.apple') },
            ]}
          />
        </Choice>
      </Card>
    </fieldset>
  );
};
