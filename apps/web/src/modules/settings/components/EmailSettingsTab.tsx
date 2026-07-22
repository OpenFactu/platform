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
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { Mail, Send, Plug, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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
        if (!res.ok) throw new Error('No se pudo cargar la configuración');
        const data = res.data;
        setCfg({ ...EMPTY, ...data });
      } catch (e: any) {
        toast.error(e?.message || 'Error');
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
      if (!res.ok) throw new Error((res.data).error || 'Error');
      const data = res.data;
      setCfg({ ...EMPTY, ...data });
      setNewPassword('');
      toast.success('Configuración guardada');
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar');
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
        setVerifyResult({ ok: true, detail: `Conectado a ${cfg.host}:${cfg.port}` });
        toast.success('Conexión SMTP OK');
      } else {
        setVerifyResult({ ok: false, detail: data.error || 'Error desconocido' });
        toast.error(`Fallo: ${data.error}`);
      }
    } catch (e: any) {
      setVerifyResult({ ok: false, detail: e?.message || 'Error' });
      toast.error(e?.message || 'Error');
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
        const accepted = (data.accepted as string[])?.join(', ') || '(sin destinatarios)';
        setTestResult({ ok: true, detail: `Correo aceptado por el SMTP · ${accepted}` });
        toast.success(`Enviado a ${accepted}`);
      } else {
        setTestResult({ ok: false, detail: data.error || 'Error' });
        toast.error(data.error || 'Fallo al enviar');
      }
    } catch (e: any) {
      setTestResult({ ok: false, detail: e?.message || 'Error' });
      toast.error(e?.message || 'Error');
    } finally {
      setSendingTest(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-400 italic">Cargando…</p>;

  return (
    <div className="space-y-6">
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Mail size={18} />
            <h2 className="text-lg font-bold">Servidor SMTP</h2>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            />
            <span>Activar envío de correo desde este tenant</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Host">
              <Input
                value={cfg.host}
                onChange={(e) => setCfg({ ...cfg, host: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </Field>
            <Field label="Puerto">
              <Input
                type="number"
                value={String(cfg.port)}
                onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) || 0 })}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={cfg.secure}
              onChange={(e) => setCfg({ ...cfg, secure: e.target.checked })}
            />
            <span>Conexión segura (TLS directo, puerto 465). Desmarcado = STARTTLS en 587.</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Usuario">
              <Input
                value={cfg.user}
                onChange={(e) => setCfg({ ...cfg, user: e.target.value })}
                placeholder="usuario@gmail.com"
              />
            </Field>
            <Field label="Password" hint={cfg.passwordSet ? 'guardada' : undefined}>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={cfg.passwordSet ? '•••••••• (dejar vacío = no cambiar)' : 'Contraseña'}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Input
                value={cfg.fromAddress}
                onChange={(e) => setCfg({ ...cfg, fromAddress: e.target.value })}
                placeholder='"Keirost" <noreply@miempresa.com>'
              />
            </Field>
            <Field label="Nombre visible">
              <Input
                value={cfg.fromName}
                onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })}
                placeholder="Keirost"
              />
            </Field>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
            <Button onClick={verify} variant="secondary" disabled={verifying}>
              <span className="inline-flex items-center gap-2">
                <Plug size={14} />
                {verifying ? 'Probando…' : 'Probar conexión'}
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
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
            <Send size={18} />
            <h2 className="text-lg font-bold">Enviar prueba</h2>
          </div>
          <p className="text-xs text-slate-500">
            El test se envía de forma sincrónica — verás el resultado al momento. Los envíos reales
            del ERP (facturas a clientes, etc.) van a una cola desatendida con reintentos.
          </p>
          <div className="flex gap-2 items-end">
            <Field label="Destinatario" className="flex-1">
              <Input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="tu@email.com (vacío = a tu propio usuario)"
              />
            </Field>
            <Button onClick={sendTest} disabled={!cfg.enabled || sendingTest}>
              <span className="inline-flex items-center gap-2">
                <Send size={14} />
                {sendingTest ? 'Enviando…' : 'Enviar test'}
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
              <XCircle size={12} /> Activa el envío arriba antes de probar.
            </p>
          )}
          {cfg.enabled && cfg.host && (
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 size={12} /> Configurado para {cfg.host}:{cfg.port}
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
