import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Badge, Button, Input, Modal, useToast, CopyButton, Spinner } from '@openfactu/ui';
import { SecurityCard, SecurityRow, SecurityRows } from '../security/SecurityCard';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Sección "Autenticación en dos pasos" (TOTP) del perfil de usuario.
 * Flujo de alta: setup (QR) → enable (código) → muestra códigos de respaldo.
 * Flujo de baja: disable (código).
 */
export const TwoFactorSettings: React.FC<{
  /** Se llama al cerrar el alta ya completada (con los códigos de respaldo vistos). */
  onEnabled?: () => void;
}> = ({ onEnabled }) => {
  const { token } = useAuth();
  const toast = useToast();
  const { t } = useI18n();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Alta
  const [setupOpen, setSetupOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  // Baja
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadStatus = async () => {
    try {
      const res = await coreApi.raw('GET', '/api/2fa/status');
      if (res.ok) setEnabled(res.data.enabled);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('POST', '/api/2fa/setup');
      const data = res.data;
      if (!res.ok) throw new Error(data.error);
      setQr(data.qrDataUrl);
      setSecret(data.secret);
      setCode('');
      setBackupCodes(null);
      setSetupOpen(true);
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settings.twoFactor.setupError'),
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmEnable = async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('POST', '/api/2fa/enable', { code: code.trim() });
      const data = res.data;
      if (!res.ok) throw new Error(data.error);
      setBackupCodes(data.backupCodes);
      setEnabled(true);
      toast.success(t('settings.twoFactor.enabledToast'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settings.twoFactor.wrongCode'),
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmDisable = async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('POST', '/api/2fa/disable', { code: disableCode.trim() });
      const data = res.data;
      if (!res.ok) {
        if (data?.code === 'MFA_REQUIRED_BY_POLICY') {
          throw new Error(t('settings.twoFactor.requiredByPolicy'));
        }
        throw new Error(data.error);
      }
      setEnabled(false);
      setDisableOpen(false);
      setDisableCode('');
      toast.success(t('settings.twoFactor.disabledToast'));
    } catch (e) {
      toast.error(
        (e instanceof Error ? e.message : undefined) || t('settings.twoFactor.wrongCode'),
      );
    } finally {
      setLoading(false);
    }
  };

  const closeSetup = () => {
    if (backupCodes) onEnabled?.();
    setSetupOpen(false);
    setQr(null);
    setSecret('');
    setCode('');
    setBackupCodes(null);
  };

  return (
    <SecurityCard
      title={t('settings.twoFactor.title')}
      description={t('settings.twoFactor.description')}
      action={
        enabled ? (
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => setDisableOpen(true)}
          >
            <ShieldOff size={14} /> {t('settings.twoFactor.disable')}
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={startSetup}
            disabled={loading || enabled === null}
          >
            {loading ? <Spinner size="sm" tone="inherit" /> : <ShieldCheck size={14} />}
            {t('settings.twoFactor.enable')}
          </Button>
        )
      }
    >
      <SecurityRows label={t('settings.twoFactor.title')}>
        <SecurityRow
          icon={
            enabled ? <ShieldCheck size={16} className="text-success" /> : <ShieldOff size={16} />
          }
          title={t('settings.twoFactor.appTitle')}
          badge={
            enabled === null ? undefined : enabled ? (
              <Badge variant="success">{t('settings.twoFactor.statusOn')}</Badge>
            ) : (
              <Badge variant="neutral">{t('settings.twoFactor.statusOff')}</Badge>
            )
          }
          meta={
            enabled === null
              ? t('settings.twoFactor.checking')
              : enabled
                ? t('settings.twoFactor.appHintOn')
                : t('settings.twoFactor.appHintOff')
          }
        />
      </SecurityRows>

      {/* Modal de alta */}
      <Modal
        isOpen={setupOpen}
        onClose={closeSetup}
        title={t('settings.twoFactor.setupTitle')}
        subtitle={t('settings.twoFactor.setupSubtitle')}
        maxWidth="md"
      >
        {backupCodes ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-300 font-bold text-sm">
              <ShieldCheck size={18} /> {t('settings.twoFactor.enabledOk')}
            </div>
            <p className="text-sm text-fg-muted">
              {t('settings.twoFactor.backupBefore')}
              <strong>{t('settings.twoFactor.backupStrong')}</strong>
              {t('settings.twoFactor.backupAfter')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-bg-muted border border-border-default rounded-lg font-mono text-sm text-fg-default">
              {backupCodes.map((c) => (
                <span key={c} className="tracking-widest">
                  {c}
                </span>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <CopyButton
                value={(backupCodes ?? []).join('\n')}
                variant="ghost"
                label={t('settings.twoFactor.copyCodes')}
              />
              <Button onClick={closeSetup}>{t('settings.twoFactor.done')}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {qr && (
              <div className="flex justify-center">
                <img
                  src={qr}
                  alt={t('settings.twoFactor.qrAlt')}
                  className="w-48 h-48 border border-border-default rounded-lg bg-white p-2"
                />
              </div>
            )}
            <div className="text-center">
              <p className="text-[11px] text-fg-subtle">{t('settings.twoFactor.manualKey')}</p>
              <code className="text-xs font-mono text-fg-body break-all">{secret}</code>
            </div>
            <Input
              label={t('settings.twoFactor.sixDigitCode')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeSetup}>
                {t('settings.twoFactor.cancel')}
              </Button>
              <Button
                onClick={confirmEnable}
                disabled={loading || code.trim().length < 6}
                className="flex items-center gap-2"
              >
                {loading && <Spinner size="sm" tone="inherit" />}
                {t('settings.twoFactor.verifyEnable')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de baja */}
      <Modal
        isOpen={disableOpen}
        onClose={() => setDisableOpen(false)}
        title={t('settings.twoFactor.disableTitle')}
        subtitle={t('settings.twoFactor.disableSubtitle')}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">{t('settings.twoFactor.disableHelp')}</p>
          <Input
            label={t('settings.twoFactor.code')}
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder={t('settings.twoFactor.codePlaceholder')}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDisableOpen(false)}>
              {t('settings.twoFactor.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={confirmDisable}
              disabled={loading || !disableCode.trim()}
              className="flex items-center gap-2"
            >
              {loading && <Spinner size="sm" tone="inherit" />}
              {t('settings.twoFactor.disable')}
            </Button>
          </div>
        </div>
      </Modal>
    </SecurityCard>
  );
};
