/**
 * Tab "Correo" en Ajustes → Empresa.
 *
 * Permite configurar el SMTP saliente del tenant (Gmail, Office 365, SMTP
 * propio…), probar la conexión sin enviar nada, y mandar un correo de prueba
 * al email del usuario logueado o a una dirección arbitraria.
 *
 * Los envíos reales del ERP (factura al cliente, etc.) van a una cola
 * desatendida en el backend — este tab solo gestiona la config.
 */

import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Checkbox, NumberInput, PasswordInput, useToast } from '@openfactu/ui';
import { Mail, Send, Plug, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

interface EmailConfigDTO {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromAddress: string;
  fromName: string;
  enabled: boolean;
  passwordSet: boolean;
}

const EMPTY: EmailConfigDTO = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  fromAddress: '',
  fromName: 'Keirost',
  enabled: false,
  passwordSet: false,
};

export const EmailSettingsTab: React.FC = () => {
  const { token } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const [cfg, setCfg] = useState<EmailConfigDTO>(EMPTY);
  const [newPassword, setNewPassword] = useState(''); // solo si el usuario lo toca
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    (async () => {
      try {
        const res = await coreApi.raw('GET', '/api/email/config');
        if (!res.ok) throw new Error(t('settingsCompany.email.loadError'));
        const data = res.data;
        setCfg({ ...EMPTY, ...data });
      } catch (e) {
        toast.error(
          (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
            t('settingsCompany.email.error'),
        );
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = { ...cfg };
      if (newPassword) payload.password = newPassword;
      const res = await coreApi.raw('PUT', '/api/email/config', payload);
      if (!res.ok) throw new Error(res.data.error || t('settingsCompany.email.error'));
      const data = res.data;
      setCfg({ ...EMPTY, ...data });
      setNewPassword('');
      toast.success(t('settingsCompany.email.saved'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.email.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      // Mandamos el formulario vigente para que la prueba use lo que ve el
      // usuario, no lo último guardado. Si hay password nueva escrita, la
      // usamos; si no, el backend cae a la guardada.
      const override: any = { ...cfg };
      if (newPassword) override.password = newPassword;
      const res = await coreApi.raw('POST', '/api/email/verify', override);
      const data = res.data;
      if (data.ok) {
        setVerifyResult({
          ok: true,
          detail: t('settingsCompany.email.connectedTo', { host: cfg.host, port: cfg.port }),
        });
        toast.success(t('settingsCompany.email.smtpOk'));
      } else {
        setVerifyResult({
          ok: false,
          detail: data.error || t('settingsCompany.email.unknownError'),
        });
        toast.error(t('settingsCompany.email.failure', { error: data.error }));
      }
    } catch (e) {
      setVerifyResult({
        ok: false,
        detail:
          (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.email.error'),
      });
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.email.error'),
      );
    } finally {
      setVerifying(false);
    }
  };

  const sendTest = async () => {
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await coreApi.raw('POST', '/api/email/test', { to: testEmail || undefined });
      const data = res.data;
      if (res.ok) {
        const accepted =
          (data.accepted as string[])?.join(', ') || t('settingsCompany.email.noRecipients');
        setTestResult({
          ok: true,
          detail: t('settingsCompany.email.acceptedBySmtp', { accepted }),
        });
        toast.success(t('settingsCompany.email.sentTo', { accepted }));
      } else {
        setTestResult({ ok: false, detail: data.error || t('settingsCompany.email.error') });
        toast.error(data.error || t('settingsCompany.email.sendFailed'));
      }
    } catch (e) {
      setTestResult({
        ok: false,
        detail:
          (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.email.error'),
      });
      toast.error(
        (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
          t('settingsCompany.email.error'),
      );
    } finally {
      setSendingTest(false);
    }
  };

  if (loading)
    return <p className="text-sm text-slate-400 italic">{t('settingsCompany.email.loading')}</p>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-fg-body">
            <Mail size={18} />
            <h2 className="text-lg font-bold">{t('settingsCompany.email.smtpServer')}</h2>
          </div>

          {/* Checkbox y no Switch: no se persiste al marcarlo, sino al pulsar «Guardar». */}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} />
            <span>{t('settingsCompany.email.enableSending')}</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('settingsCompany.email.host')}>
              <Input
                value={cfg.host}
                onChange={(e) => setCfg({ ...cfg, host: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </Field>
            <Field label={t('settingsCompany.email.port')}>
              <NumberInput
                value={cfg.port}
                onChange={(v) => setCfg({ ...cfg, port: v ?? 0 })}
                min={1}
                max={65535}
                emptyValue="zero"
                thousandSeparator={false}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={cfg.secure} onChange={(v) => setCfg({ ...cfg, secure: v })} />
            <span>{t('settingsCompany.email.secure')}</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('settingsCompany.email.user')}>
              <Input
                value={cfg.user}
                onChange={(e) => setCfg({ ...cfg, user: e.target.value })}
                placeholder={t('settingsCompany.email.userPlaceholder')}
              />
            </Field>
            <Field
              label={t('settingsCompany.email.password')}
              hint={cfg.passwordSet ? t('settingsCompany.email.passwordSaved') : undefined}
            >
              {/* Sin showStrength: es una contraseña de aplicación que da el
                  proveedor SMTP, no una que el usuario elija. */}
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={
                  cfg.passwordSet
                    ? t('settingsCompany.email.passwordKeep')
                    : t('settingsCompany.email.passwordPlaceholder')
                }
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('settingsCompany.email.from')}>
              <Input
                value={cfg.fromAddress}
                onChange={(e) => setCfg({ ...cfg, fromAddress: e.target.value })}
                placeholder='"Keirost" <noreply@miempresa.com>'
              />
            </Field>
            <Field label={t('settingsCompany.email.fromName')}>
              <Input
                value={cfg.fromName}
                onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })}
                placeholder="Keirost"
              />
            </Field>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? t('settingsCompany.email.saving') : t('settingsCompany.email.save')}
            </Button>
            <Button onClick={verify} variant="secondary" disabled={verifying}>
              <span className="inline-flex items-center gap-2">
                <Plug size={14} />
                {verifying
                  ? t('settingsCompany.email.testing')
                  : t('settingsCompany.email.testConnection')}
              </span>
            </Button>
          </div>
          {verifyResult && (
            <div
              className={`text-xs p-2 rounded-md flex items-start gap-2 ${
                verifyResult.ok
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
              }`}
            >
              {verifyResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span className="break-all">{verifyResult.detail}</span>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-fg-body">
            <Send size={18} />
            <h2 className="text-lg font-bold">{t('settingsCompany.email.sendTestTitle')}</h2>
          </div>
          <p className="text-xs text-slate-500">{t('settingsCompany.email.sendTestHelp')}</p>
          <div className="flex gap-2 items-end">
            <Field label={t('settingsCompany.email.recipient')} className="flex-1">
              <Input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder={t('settingsCompany.email.recipientPlaceholder')}
              />
            </Field>
            <Button onClick={sendTest} disabled={!cfg.enabled || sendingTest}>
              <span className="inline-flex items-center gap-2">
                <Send size={14} />
                {sendingTest
                  ? t('settingsCompany.email.sending')
                  : t('settingsCompany.email.sendTest')}
              </span>
            </Button>
          </div>
          {testResult && (
            <div
              className={`text-xs p-2 rounded-md flex items-start gap-2 ${
                testResult.ok
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
              }`}
            >
              {testResult.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              <span className="break-all">{testResult.detail}</span>
            </div>
          )}
          {!cfg.enabled && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <XCircle size={12} /> {t('settingsCompany.email.enableFirst')}
            </p>
          )}
          {cfg.enabled && cfg.host && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 size={12} />{' '}
              {t('settingsCompany.email.configuredFor', { host: cfg.host, port: cfg.port })}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
};

/**
 * Wrapper uniforme para un campo del formulario: label de altura fija (así
 * las filas con/sin hint quedan alineadas) + el input debajo.
 */
const Field: React.FC<{
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, hint, className, children }) => (
  <div className={`flex flex-col gap-1 ${className || ''}`}>
    <div className="h-4 flex items-center gap-2">
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider leading-none">
        {label}
      </span>
      {hint && (
        <span className="text-[10px] font-normal text-emerald-600 leading-none">({hint})</span>
      )}
    </div>
    {children}
  </div>
);
