import React from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  FormGrid,
  FormSection,
  NumberInput,
  PageHeader,
  SegmentedControl,
  Spinner,
  Switch,
  useToast,
} from '@openfactu/ui';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { usePolicy } from '../security/usePolicy';
import {
  AUTH_METHODS,
  LIMITS,
  MFA_SCOPES,
  toggleMethod,
  type AuthMethod,
} from '../security/policyModel';

const METHOD_KEYS: Record<AuthMethod, string> = {
  password: 'settings.securityPolicy.methods.password',
  passkey: 'settings.securityPolicy.methods.passkey',
  email_code: 'settings.securityPolicy.methods.emailCode',
  sso: 'settings.securityPolicy.methods.sso',
};

/** «Seguridad del acceso» de la empresa: 2FA obligatorio, sesión, formas de entrar y contraseñas. */
export const SecurityPolicy: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { user } = useAuth();
  const { draft, loading, loadError, saving, saveError, dirty, patch, patchRules, save, reset } =
    usePolicy();

  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    !!user?.permissions?.['/settings/security']?.write;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await save()) toast.success(t('settings.securityPolicy.saved'));
  };

  const header = (
    <PageHeader
      title={t('settings.securityPolicy.title')}
      subtitle={t('settings.securityPolicy.subtitle')}
      icon={<ShieldCheck size={18} />}
      size="lg"
    />
  );

  if (loading) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
        {header}
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6">
        {header}
        <Alert tone="danger">{loadError || t('settings.securityPolicy.loadError')}</Alert>
      </div>
    );
  }

  const rules = draft.passwordRules;

  return (
    <form
      onSubmit={onSubmit}
      className="p-4 sm:p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500"
    >
      {header}

      {!canWrite && <Alert tone="info">{t('settings.securityPolicy.readOnly')}</Alert>}

      <Card className="p-4 sm:p-6 space-y-6 border-border-subtle">
        <FormSection
          title={t('settings.securityPolicy.mfa.title')}
          description={t('settings.securityPolicy.mfa.description')}
        >
          <SegmentedControl
            aria-label={t('settings.securityPolicy.mfa.title')}
            value={draft.mfa}
            onChange={(mfa) => patch({ mfa })}
            disabled={!canWrite}
            fullWidth
            options={MFA_SCOPES.map((v) => ({
              value: v,
              label: t(`settings.securityPolicy.mfa.${v}`),
            }))}
          />
        </FormSection>

        <FormSection
          title={t('settings.securityPolicy.session.title')}
          description={t('settings.securityPolicy.session.description')}
        >
          <FormGrid columns={2}>
            <Field
              label={t('settings.securityPolicy.session.maxDays')}
              hint={t('settings.securityPolicy.session.maxDaysHint', {
                min: LIMITS.sessionMaxDays.min,
                max: LIMITS.sessionMaxDays.max,
              })}
            >
              <NumberInput
                value={draft.sessionMaxDays}
                onChange={(v) => v !== null && patch({ sessionMaxDays: v })}
                commitOn="blur"
                min={LIMITS.sessionMaxDays.min}
                max={LIMITS.sessionMaxDays.max}
                disabled={!canWrite}
              />
            </Field>
            <Field
              label={t('settings.securityPolicy.session.idleHours')}
              hint={t('settings.securityPolicy.session.idleHoursHint', {
                min: LIMITS.idleHours.min,
                max: LIMITS.idleHours.max,
              })}
            >
              <NumberInput
                value={draft.idleHours}
                onChange={(v) => v !== null && patch({ idleHours: v })}
                commitOn="blur"
                min={LIMITS.idleHours.min}
                max={LIMITS.idleHours.max}
                disabled={!canWrite}
              />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection
          title={t('settings.securityPolicy.methods.title')}
          description={t('settings.securityPolicy.methods.description')}
        >
          <div className="space-y-3">
            {AUTH_METHODS.map((m) => (
              <Checkbox
                key={m}
                checked={draft.allowedMethods.includes(m)}
                onChange={(on) =>
                  patch({ allowedMethods: toggleMethod(draft.allowedMethods, m, on) })
                }
                disabled={!canWrite}
                label={t(METHOD_KEYS[m])}
              />
            ))}
            <div className="pt-2">
              <Switch
                checked={draft.ssoRequired}
                onChange={(ssoRequired) => patch({ ssoRequired })}
                disabled={!canWrite}
                label={t('settings.securityPolicy.ssoRequired')}
              />
              <p className="text-xs text-fg-subtle mt-1">
                {t('settings.securityPolicy.ssoRequiredHint')}
              </p>
            </div>
          </div>
        </FormSection>

        <FormSection
          title={t('settings.securityPolicy.passwords.title')}
          description={t('settings.securityPolicy.passwords.description')}
        >
          <div className="space-y-4">
            <Switch
              checked={rules.enabled}
              onChange={(enabled) => patchRules({ enabled })}
              disabled={!canWrite}
              label={t('settings.securityPolicy.passwords.enable')}
            />
            {rules.enabled && (
              <FormGrid columns={2}>
                <Field
                  label={t('settings.securityPolicy.passwords.minLength')}
                  hint={t('settings.securityPolicy.passwords.minLengthHint', {
                    min: LIMITS.minLength.min,
                    max: LIMITS.minLength.max,
                  })}
                >
                  <NumberInput
                    value={rules.minLength}
                    onChange={(v) => v !== null && patchRules({ minLength: v })}
                    commitOn="blur"
                    min={LIMITS.minLength.min}
                    max={LIMITS.minLength.max}
                    disabled={!canWrite}
                  />
                </Field>
                <div className="flex items-end pb-2">
                  <Checkbox
                    checked={rules.blockCommon}
                    onChange={(blockCommon) => patchRules({ blockCommon })}
                    disabled={!canWrite}
                    label={t('settings.securityPolicy.passwords.blockCommon')}
                  />
                </div>
              </FormGrid>
            )}
          </div>
        </FormSection>
      </Card>

      {saveError && (
        <Alert
          tone="danger"
          role="alert"
          title={t(
            saveError.kind === 'lockout'
              ? 'settings.securityPolicy.errors.lockoutTitle'
              : saveError.kind === 'invalid'
                ? 'settings.securityPolicy.errors.invalid'
                : 'settings.securityPolicy.errors.saveFailed',
          )}
        >
          {saveError.kind === 'lockout'
            ? saveError.message
            : saveError.kind === 'other'
              ? saveError.message
              : null}
        </Alert>
      )}

      {canWrite && (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button type="button" variant="secondary" onClick={reset} disabled={!dirty || saving}>
            {t('settings.securityPolicy.discard')}
          </Button>
          <Button type="submit" disabled={!dirty || saving} className="flex items-center gap-2">
            {saving && <Spinner size="sm" tone="inherit" />}
            {t('settings.securityPolicy.save')}
          </Button>
        </div>
      )}
    </form>
  );
};
