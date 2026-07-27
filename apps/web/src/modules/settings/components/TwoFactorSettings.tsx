import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Modal, useToast } from '@openfactu/ui';
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * Sección "Autenticación en dos pasos" (TOTP) del perfil de usuario.
 * Flujo de alta: setup (QR) → enable (código) → muestra códigos de respaldo.
 * Flujo de baja: disable (código).
 */
export const TwoFactorSettings: React.FC = () => {
  const { token } = useAuth();
  const toast = useToast();

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // Alta
  const [setupOpen, setSetupOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

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
      toast.error((e instanceof Error ? e.message : undefined) || 'No se pudo iniciar el 2FA');
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
      toast.success('2FA activado');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  };

  const confirmDisable = async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('POST', '/api/2fa/disable', { code: disableCode.trim() });
      const data = res.data;
      if (!res.ok) throw new Error(data.error);
      setEnabled(false);
      setDisableOpen(false);
      setDisableCode('');
      toast.success('2FA desactivado');
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    if (!backupCodes) return;
    navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const closeSetup = () => {
    setSetupOpen(false);
    setQr(null);
    setSecret('');
    setCode('');
    setBackupCodes(null);
  };

  return (
    <Card className="p-6 space-y-4 border-border-subtle">
      <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
        <ShieldCheck size={14} /> Autenticación en dos pasos (2FA)
      </h2>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              enabled
                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                : 'bg-bg-muted text-fg-subtle'
            }`}
          >
            {enabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
          </div>
          <div>
            <p className="text-sm font-black text-fg-default">
              {enabled === null ? 'Comprobando…' : enabled ? 'Activado' : 'Desactivado'}
            </p>
            <p className="text-[11px] text-fg-subtle font-medium max-w-sm">
              Añade una capa extra de seguridad pidiendo un código de tu app de autenticación al
              iniciar sesión.
            </p>
          </div>
        </div>

        {enabled ? (
          <Button
            variant="danger"
            onClick={() => setDisableOpen(true)}
            className="flex items-center gap-2"
          >
            <ShieldOff size={16} /> Desactivar
          </Button>
        ) : (
          <Button onClick={startSetup} disabled={loading} className="flex items-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            Activar 2FA
          </Button>
        )}
      </div>

      {/* Modal de alta */}
      <Modal
        isOpen={setupOpen}
        onClose={closeSetup}
        title="Configurar 2FA"
        subtitle="Escanea el código con tu app de autenticación"
        maxWidth="md"
      >
        {backupCodes ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-300 font-bold text-sm">
              <ShieldCheck size={18} /> 2FA activado correctamente
            </div>
            <p className="text-sm text-fg-muted">
              Guarda estos <strong>códigos de respaldo</strong> en un lugar seguro. Cada uno sirve
              una sola vez para iniciar sesión si pierdes acceso a tu app. No volverán a mostrarse.
            </p>
            <div className="grid grid-cols-2 gap-2 p-4 bg-bg-muted border border-border-default rounded-lg font-mono text-sm text-fg-default">
              {backupCodes.map((c) => (
                <span key={c} className="tracking-widest">
                  {c}
                </span>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={copyBackupCodes}
                className="flex items-center gap-1.5"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copiado' : 'Copiar códigos'}
              </Button>
              <Button onClick={closeSetup}>Hecho</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {qr && (
              <div className="flex justify-center">
                <img
                  src={qr}
                  alt="Código QR para 2FA"
                  className="w-48 h-48 border border-border-default rounded-lg bg-white p-2"
                />
              </div>
            )}
            <div className="text-center">
              <p className="text-[11px] text-fg-subtle">
                ¿No puedes escanear? Introduce esta clave manualmente:
              </p>
              <code className="text-xs font-mono text-fg-body break-all">{secret}</code>
            </div>
            <Input
              label="Código de 6 dígitos"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={closeSetup}>
                Cancelar
              </Button>
              <Button
                onClick={confirmEnable}
                disabled={loading || code.trim().length < 6}
                className="flex items-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                Verificar y activar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de baja */}
      <Modal
        isOpen={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Desactivar 2FA"
        subtitle="Introduce un código para confirmar"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Introduce un código de tu app (o un código de respaldo) para desactivar la autenticación
            en dos pasos.
          </p>
          <Input
            label="Código"
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value)}
            placeholder="123456 o código de respaldo"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDisableOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={confirmDisable}
              disabled={loading || !disableCode.trim()}
              className="flex items-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Desactivar
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};
