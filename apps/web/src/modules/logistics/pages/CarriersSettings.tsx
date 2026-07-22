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
  useToast,
  SearchableSelect,
} from '@openfactu/ui';
import { Plus, Trash2, Edit2, Truck, Plug, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import type { Carrier, CarrierAccount, CarrierAdapterInfo } from '../domain/carrier';

export const CarriersSettings: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
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
    if (!confirm('¿Eliminar transportista y todas sus cuentas?')) return;
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
    if (!confirm('¿Eliminar cuenta?')) return;
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
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Truck className="text-indigo-600 dark:text-indigo-300" size={22} />
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              Transportistas
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
                <li
                  key={c.id}
                  className="border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                >
                  <div className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => toggleExpand(c)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                          {c.name}
                        </span>
                        {c.code && (
                          <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
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
                    <button
                      onClick={() => openEditCarrier(c)}
                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => removeCarrier(c.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-4 pb-3 bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="flex items-center justify-between mb-2 pt-2">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Cuentas
                        </div>
                        <button
                          onClick={() => openNewAccount(c)}
                          className="text-[11px] text-primary hover:underline"
                        >
                          + Añadir cuenta
                        </button>
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
                                className="flex items-center gap-2 px-2 py-1.5 rounded bg-white dark:bg-slate-900 text-xs"
                              >
                                <span className="font-semibold">{a.name}</span>
                                {a.sandbox && <Badge variant="warning">sandbox</Badge>}
                                {a.isDefault && <Badge variant="info">default</Badge>}
                                <div className="flex-1" />
                                <button
                                  onClick={() => testAccount(a.id)}
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                                >
                                  <CheckCircle2 size={11} /> Probar
                                </button>
                                <button
                                  onClick={() => removeAccount(a.id, c.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500"
                                >
                                  <Trash2 size={12} />
                                </button>
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
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Nombre
              </label>
              <Input
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Seur, DHL, Transporte propio…"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Código (opcional)
              </label>
              <Input
                value={form.code || ''}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="SEUR"
              />
            </div>
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
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Notas
            </label>
            <Input
              value={form.notes || ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive !== false}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Activo
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
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
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Nombre de la cuenta
            </label>
            <Input
              value={accountForm.name || ''}
              onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              placeholder="Producción, staging, cuenta secundaria…"
            />
          </div>
          {selectedAdapter && selectedAdapter.credentialFields.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Credenciales ({selectedAdapter.name})
              </div>
              {selectedAdapter.credentialFields.map((f) => (
                <div key={f.key}>
                  <label className="text-xs block mb-0.5">
                    {f.label} {f.required && <span className="text-rose-500">*</span>}
                  </label>
                  {f.type === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={!!accountForm.credentials?.[f.key]}
                      onChange={(e) =>
                        setAccountForm({
                          ...accountForm,
                          credentials: {
                            ...accountForm.credentials,
                            [f.key]: e.target.checked,
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
            <div className="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded px-3 py-2">
              Este carrier es manual. La cuenta servirá solo como etiqueta organizativa.
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!accountForm.sandbox}
              onChange={(e) => setAccountForm({ ...accountForm, sandbox: e.target.checked })}
            />
            Sandbox (pruebas)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!accountForm.isDefault}
              onChange={(e) => setAccountForm({ ...accountForm, isDefault: e.target.checked })}
            />
            Cuenta por defecto
          </label>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
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
