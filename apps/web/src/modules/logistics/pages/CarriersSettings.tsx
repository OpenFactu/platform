/**
 * Ajustes → Transportistas.
 *
 * UI simple: lista de carriers, CRUD con modal. Cada carrier puede tener
 * (opcionalmente) un adapter del core — si lo tiene, se le pueden crear
 * cuentas con credenciales y usar el botón "Probar conexión". Si no,
 * funciona como manual.
 */

import { carriersApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Modal,
  Badge,
  Loader,
  Checkbox,
  useToast,
  usePopup,
  SearchableSelect,
} from '@openfactu/ui';
import { Plus, Trash2, Edit2, Truck, Plug, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import type { Carrier, CarrierAccount, CarrierAdapterInfo } from '../domain/carrier';

export const CarriersSettings: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [adapters, setAdapters] = useState<CarrierAdapterInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [editing, setEditing] = useState<Carrier | null>(null);
  const [form, setForm] = useState<Partial<Carrier>>({});

  const [expanded, setExpanded] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<CarrierAccount[]>([]);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountForm, setAccountForm] = useState<any>({ credentials: {} });
  const [accountCarrier, setAccountCarrier] = useState<Carrier | null>(null);

  const loadCarriers = async () => {
    setLoading(true);
    try {
      const [c, a] = await Promise.all([carriersApi.list(), carriersApi.listAdapters()]);
      setCarriers(Array.isArray(c) ? c : []);
      setAdapters(Array.isArray(a) ? a : []);
    } catch {
      setCarriers([]);
      setAdapters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) loadCarriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const loadAccounts = async (carrierId: string) => {
    try {
      const d = await carriersApi.listAccounts(carrierId);
      setAccounts(Array.isArray(d) ? d : []);
    } catch {
      setAccounts([]);
    }
  };

  const toggleExpand = async (c: Carrier) => {
    if (expanded === c.id) {
      setExpanded(null);
      return;
    }
    setExpanded(c.id);
    await loadAccounts(c.id);
  };

  const openNewCarrier = () => {
    setEditing(null);
    setForm({ isActive: true });
    setShowCarrierModal(true);
  };

  const openEditCarrier = (c: Carrier) => {
    setEditing(c);
    setForm({ ...c });
    setShowCarrierModal(true);
  };

  const saveCarrier = async () => {
    if (!form.name) {
      toast.error('El nombre es obligatorio');
      return;
    }
    try {
      if (editing) await carriersApi.update(editing.id, form);
      else await carriersApi.create(form);
      toast.success(editing ? 'Carrier actualizado' : 'Carrier creado');
      setShowCarrierModal(false);
      loadCarriers();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error');
    }
  };

  const removeCarrier = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar transportista',
      message: '¿Eliminar el transportista y todas sus cuentas?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    await carriersApi.remove(id);
    loadCarriers();
  };

  const openNewAccount = (c: Carrier) => {
    setAccountCarrier(c);
    setAccountForm({ credentials: {}, sandbox: true });
    setShowAccountModal(true);
  };

  const saveAccount = async () => {
    if (!accountCarrier) return;
    if (!accountForm.name) {
      toast.error('Nombre obligatorio');
      return;
    }
    try {
      await carriersApi.createAccount(accountCarrier.id, accountForm);
      toast.success('Cuenta creada');
      setShowAccountModal(false);
      loadAccounts(accountCarrier.id);
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error');
    }
  };

  const removeAccount = async (id: string, carrierId: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar cuenta',
      message: '¿Eliminar la cuenta del transportista?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    await carriersApi.removeAccount(id);
    loadAccounts(carrierId);
  };

  const testAccount = async (id: string) => {
    try {
      const d = await carriersApi.testAccount(id);
      if (d.ok) {
        toast.success(`OK — tracking de prueba: ${d.trackingNumber || '(ninguno)'}`);
      } else if (d.manual) {
        toast.error('Carrier manual — sin conexión que probar');
      } else {
        toast.error(d.error || 'Fallo al probar');
      }
    } catch {
      toast.error('Fallo al probar');
    }
  };

  const adapterOpts = [
    { value: '', label: '— sin adapter (manual) —' },
    ...adapters.map((a) => ({ value: a.id, label: a.name })),
  ];
  const selectedAdapter = adapters.find((a) => a.id === accountCarrier?.adapterId);

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-3">
          <Truck className="text-indigo-600 dark:text-indigo-300" size={22} />
          <div>
            <h1 className="text-xl font-black tracking-tight text-fg-default">Transportistas</h1>
            <p className="text-xs text-fg-muted">
              Da de alta cualquier transportista. Si existe un adapter en el core puedes conectarlo;
              si no, queda como gestión manual.
            </p>
          </div>
        </div>
        <Button onClick={openNewCarrier} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo
        </Button>
      </header>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : carriers.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          Sin transportistas. Crea el primero — puede ser de cualquier empresa.
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {carriers.map((c) => {
              const isOpen = expanded === c.id;
              const adapter = adapters.find((a) => a.id === c.adapterId);
              return (
                <li key={c.id} className="border-b border-border-subtle last:border-0">
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(c)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-fg-default">{c.name}</span>
                        {c.code && (
                          <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                            {c.code}
                          </code>
                        )}
                        {!c.isActive && <Badge variant="neutral">Inactivo</Badge>}
                        {adapter ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <Plug size={11} /> {adapter.name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Manual</span>
                        )}
                      </div>
                      {c.notes && (
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">{c.notes}</div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditCarrier(c)}
                      title="Editar"
                    >
                      <Edit2 size={13} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCarrier(c.id)}
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-3 bg-bg-muted">
                      <div className="flex items-center justify-between mb-2 pt-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Cuentas
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => openNewAccount(c)}
                        >
                          <Plus size={12} /> Añadir cuenta
                        </Button>
                      </div>
                      {accounts.filter((a) => a.carrierId === c.id).length === 0 ? (
                        <div className="text-[11px] text-slate-500 italic py-2">
                          Sin cuentas creadas.
                        </div>
                      ) : (
                        <ul className="space-y-1">
                          {accounts
                            .filter((a) => a.carrierId === c.id)
                            .map((a) => (
                              <li
                                key={a.id}
                                className="flex items-center gap-2 px-2 py-1.5 rounded bg-bg-card text-xs"
                              >
                                <span className="font-semibold">{a.name}</span>
                                {a.sandbox && <Badge variant="warning">sandbox</Badge>}
                                {a.isDefault && <Badge variant="info">default</Badge>}
                                <div className="flex-1" />
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => testAccount(a.id)}
                                  title="Probar conexión"
                                >
                                  <CheckCircle2 size={11} /> Probar
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeAccount(a.id, c.id)}
                                  title="Eliminar cuenta"
                                >
                                  <Trash2 size={12} />
                                </Button>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Modal Carrier */}
      <Modal
        isOpen={showCarrierModal}
        onClose={() => setShowCarrierModal(false)}
        title={editing ? 'Editar transportista' : 'Nuevo transportista'}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre"
              requiredMark
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Seur, DHL, Transporte propio…"
            />
            <Input
              label="Código (opcional)"
              value={form.code || ''}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="SEUR"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Integración (opcional)
            </label>
            <SearchableSelect
              options={adapterOpts}
              value={form.adapterId || ''}
              onChange={(v) => setForm({ ...form, adapterId: v || null })}
              placeholder="— seleccionar —"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Si no eliges adapter, el carrier funciona en modo manual — tracking libre, sin
              llamadas externas.
            </p>
          </div>
          <Input
            label="Notas"
            value={form.notes || ''}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          {/* Campo de formulario (se guarda con "Guardar") → Checkbox, que NO
              tiene prop `label`: se conserva el <label> que lo envuelve. */}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.isActive !== false}
              onChange={(v) => setForm({ ...form, isActive: v })}
            />
            Activo
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowCarrierModal(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCarrier}>Guardar</Button>
          </div>
        </div>
      </Modal>

      {/* Modal Cuenta */}
      <Modal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        title={accountCarrier ? `Nueva cuenta · ${accountCarrier.name}` : 'Nueva cuenta'}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <Input
            label="Nombre de la cuenta"
            requiredMark
            value={accountForm.name || ''}
            onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
            placeholder="Producción, staging, cuenta secundaria…"
          />
          {selectedAdapter && selectedAdapter.credentialFields.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border-subtle">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Credenciales ({selectedAdapter.name})
              </div>
              {selectedAdapter.credentialFields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs block mb-0.5">
                    {f.label} {f.required && <span className="text-danger">*</span>}
                  </label>
                  {f.type === 'checkbox' ? (
                    <Checkbox
                      checked={!!accountForm.credentials?.[f.key]}
                      onChange={(v) =>
                        setAccountForm({
                          ...accountForm,
                          credentials: {
                            ...accountForm.credentials,
                            [f.key]: v,
                          },
                        })
                      }
                    />
                  ) : (
                    <Input
                      type={f.type === 'password' ? 'password' : 'text'}
                      value={accountForm.credentials?.[f.key] || ''}
                      onChange={(e) =>
                        setAccountForm({
                          ...accountForm,
                          credentials: {
                            ...accountForm.credentials,
                            [f.key]: e.target.value,
                          },
                        })
                      }
                      placeholder={f.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {!selectedAdapter && accountCarrier && (
            <div className="text-[11px] text-slate-500 bg-bg-muted rounded px-3 py-2">
              Este carrier es manual. La cuenta servirá solo como etiqueta organizativa.
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!accountForm.sandbox}
              onChange={(v) => setAccountForm({ ...accountForm, sandbox: v })}
            />
            Sandbox (pruebas)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={!!accountForm.isDefault}
              onChange={(v) => setAccountForm({ ...accountForm, isDefault: v })}
            />
            Cuenta por defecto
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowAccountModal(false)}>
              Cancelar
            </Button>
            <Button onClick={saveAccount}>Crear</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CarriersSettings;
