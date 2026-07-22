import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Modal, useToast } from '@openfactu/ui';
import { ShieldCheck, ShieldOff, Loader2, Copy, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
      const res = await fetch('/api/2fa/status', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEnabled((await res.json()).enabled);
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
      const res = await fetch('/api/2fa/setup', { method: 'POST', headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQr(data.qrDataUrl);
      setSecret(data.secret);
      setCode('');
      setBackupCodes(null);
      setSetupOpen(true);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo iniciar el 2FA');
    } finally {
      setLoading(false);
    }
  };

  const confirmEnable = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/2fa/enable', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBackupCodes(data.backupCodes);
      setEnabled(true);
      toast.success('2FA activado');
    } catch (e: any) {
      toast.error(e.message || 'Código incorrecto');
    } finally {
      setLoading(false);
    }
  };

  const confirmDisable = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/2fa/disable', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ code: disableCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEnabled(false);
      setDisableOpen(false);
      setDisableCode('');
      toast.success('2FA desactivado');
    } catch (e: any) {
      toast.error(e.message || 'Código incorrecto');
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
    <Card className="p-6 space-y-4 border-slate-100 dark:border-slate-800">
      <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
        <ShieldCheck size={14} /> Autenticación en dos pasos (2FA)
      </h2>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              enabled
                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
            }`}
          >
            {enabled ? <ShieldCheck size={20} /> : <ShieldOff size={20} />}
          </div>
          <div>
            <p className="text-sm font-black text-slate-800 dark:text-slate-100">
              {enabled === null ? 'Comprobando…' : enabled ? 'Activado' : 'Desactivado'}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium max-w-sm">
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
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Guarda estos <strong>códigos de respaldo</strong> en un lugar seguro. Cada uno sirve
              una sola vez para iniciar sesión si pierdes acceso a tu app. No volverán a mostrarse.
            </p>
            <div className="grid grid-cols-2 gap-2 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-sm text-slate-800 dark:text-slate-100">
              {backupCodes.map((c) => (
                <span key={c} className="tracking-widest">
                  {c}
                </span>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={copyBackupCodes}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-accent hover:text-accent/80"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copiado' : 'Copiar códigos'}
              </button>
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
                  className="w-48 h-48 border border-slate-200 dark:border-slate-700 rounded-lg bg-white p-2"
                />
              </div>
            )}
            <div className="text-center">
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                ¿No puedes escanear? Introduce esta clave manualmente:
              </p>
              <code className="text-xs font-mono text-slate-700 dark:text-slate-200 break-all">
                {secret}
              </code>
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
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
