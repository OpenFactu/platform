import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validateIban, validateSwift, formatIban } from '../utils/bankValidation';
import { Table, Card, Button, Input, Modal, useToast, Badge } from '@openfactu/ui';
import { Users, Plus, MapPin, Contact, FileText, Trash2, Edit2, Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CountrySelect } from '../components/geo/CountrySelect';
import { SubRegionSelect } from '../components/geo/SubRegionSelect';
import { LocalitySelect } from '../components/geo/LocalitySelect';
import { TaxIdInput } from '../components/geo/TaxIdInput';
import { PostalCodeInput } from '../components/geo/PostalCodeInput';
import { PhoneInput } from '../components/geo/PhoneInput';
import { PluginFieldsPanel } from '../components/PluginFieldsPanel';
import { usePluginListColumns } from '../components/plugin-fields';
import { AttachmentsPanel } from '../components/AttachmentsPanel';

export const Partners: React.FC = () => {
  const { token, user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const toast = useToast();
  const [partners, setPartners] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'contact' | 'addresses' | 'fiscal'>(
    'general',
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    groupId: '',
    name: '',
    code: '',
    nif: '',
    foreignName: '',
    phone: '',
    email: '',
    website: '',
    priceListId: '',
    countryCode: 'ES',
    // Mig 033 — defaults fiscales que la factura hereda al elegir este partner
    defaultDocumentTypeId: '',
    defaultPaymentMethodId: '',
    defaultPaymentTermId: '',
    defaultWithholdingRate: '' as string | number,
    iban: '',
    bankName: '',
    bankSwift: '',
  });
  const [addresses, setAddresses] = useState<any[]>([]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/partners', {
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' },
      });
      const data = await res.json();
      setPartners(data);
    } catch {
      toast.error('Error al cargar interlocutores');
    } finally {
      setLoading(false);
    }
  };

  const fetchPriceLists = async () => {
    try {
      const res = await fetch('/api/pricelists', {
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' },
      });
      const data = await res.json();
      setPriceLists(Array.isArray(data) ? data : []);
    } catch {
      console.error('Error loading price lists');
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await fetch('/api/partnerGroups', {
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' },
      });
      const data = await res.json();
      setGroups(data);
    } catch {
      console.error('Error loading groups');
    }
  };

  useEffect(() => {
    if (user?.tenantId) {
      fetchPartners();
      fetchGroups();
      fetchPriceLists();
    }
  }, [user?.tenantId]);

  const openModal = (partner: any = null) => {
    if (partner) {
      setEditingId(partner.id);
      setFormData({
        groupId: partner.groupId || '',
        name: partner.name || '',
        code: partner.code || '',
        nif: partner.nif || '',
        foreignName: partner.foreignName || '',
        phone: partner.phone || '',
        email: partner.email || '',
        website: partner.website || '',
        priceListId: partner.priceListId || '',
        countryCode: partner.countryCode || 'ES',
        defaultDocumentTypeId: partner.defaultDocumentTypeId || '',
        defaultPaymentMethodId: partner.defaultPaymentMethodId || '',
        defaultPaymentTermId: partner.defaultPaymentTermId || '',
        defaultWithholdingRate: partner.defaultWithholdingRate ?? '',
        iban: partner.iban || '',
        bankName: partner.bankName || '',
        bankSwift: partner.bankSwift || '',
      });
      setAddresses(partner.addresses?.map((a: any) => ({ ...a })) || []);
    } else {
      setEditingId(null);
      setFormData({
        groupId: '',
        name: '',
        code: '',
        nif: '',
        foreignName: '',
        phone: '',
        email: '',
        website: '',
        priceListId: '',
        countryCode: 'ES',
        defaultDocumentTypeId: '',
        defaultPaymentMethodId: '',
        defaultPaymentTermId: '',
        defaultWithholdingRate: '',
        iban: '',
        bankName: '',
        bankSwift: '',
      });
      setAddresses([]);
    }
    setActiveTab('general');
    setIsModalOpen(true);
  };

  const addAddress = () => {
    setAddresses([
      ...addresses,
      {
        name: '',
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: '',
        type: 'B',
        isDefault: addresses.length === 0,
        countryCode: formData.countryCode || 'ES',
        subRegionId: '',
        localityId: '',
      },
    ]);
  };

  const updateAddress = (idx: number, field: string, value: any) => {
    setAddresses((prev) => {
      const newAddr = [...prev];
      if (field === 'isDefault' && value === true) {
        const currentType = newAddr[idx].type;
        newAddr.forEach((a) => {
          if (a.type === currentType) a.isDefault = false;
        });
      }
      if (field === 'type') {
        const isCurrentlyDefault = newAddr[idx].isDefault;
        if (isCurrentlyDefault) {
          newAddr.forEach((a) => {
            if (a.type === value && a !== newAddr[idx]) a.isDefault = false;
          });
        }
      }
      newAddr[idx] = { ...newAddr[idx], [field]: value };
      return newAddr;
    });
  };

  const removeAddress = (idx: number) => {
    setAddresses(addresses.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.groupId) return toast.error('Nombre y Grupo son obligatorios');

    try {
      const url = editingId ? `/api/partners/${editingId}` : '/api/partners';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user?.tenantId || '',
        },
        body: JSON.stringify({ ...formData, addresses }),
      });

      if (res.ok) {
        toast.success(editingId ? 'Interlocutor actualizado' : 'Interlocutor creado');
        setIsModalOpen(false);
        fetchPartners();
      } else {
        const err = await res.json();
        toast.error(`Error: ${err.error}`);
      }
    } catch {
      toast.error('Error de red al guardar socio');
    }
  };

  const columns = [
    {
      header: 'Código', sortable: true, sortAccessor: (i: any) => i.code ?? '',
      cell: (p: any) => (
        <Badge variant="neutral" className="font-mono">
          {p.code}
        </Badge>
      ),
    },
    {
      header: 'Razón Social',
      cell: (p: any) => (
        <span className="font-bold">
          {p.name}{' '}
          {p.foreignName && (
            <span className="text-slate-400 dark:text-slate-500 font-normal text-xs ml-1">
              ({p.foreignName})
            </span>
          )}
        </span>
      ),
    },
    { header: 'NIF/VAT', cell: (p: any) => p.nif },
    { header: 'Grupo', sortable: true, sortAccessor: (i: any) => i.groupName ?? '', cell: (p: any) => groups.find((g) => g.id === p.groupId)?.name || '-' },
    { header: 'Contacto', cell: (p: any) => p.email || p.phone || '-' },
    {
      header: 'Direcciones',
      cell: (p: any) => <Badge variant="info">{p.addresses?.length || 0}</Badge>,
    },
    {
      header: '',
      cell: (p: any) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => openModal(p)}
          disabled={!canWrite}
          className="disabled:opacity-50 disabled:grayscale transition-all"
        >
          <Edit2 size={14} />
        </Button>
      ),
    },
  ];

  const pluginCols = usePluginListColumns('BusinessPartner');
  const actionsCol = columns[columns.length - 1];
  const restCols = columns.slice(0, -1);
  const allColumns = [...restCols, ...pluginCols, actionsCol];

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
            <Users className="text-blue-600 dark:text-blue-300" size={32} />
            Datos Maestros Interlocutor
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Gestión avanzada y centralizada de Clientes y Proveedores.
          </p>
        </div>
        <Button
          onClick={() => openModal()}
          disabled={!canWrite}
          className="flex items-center gap-2 shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:grayscale transition-all"
        >
          <Plus size={18} />
          Nuevo Interlocutor
        </Button>
      </div>

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={allColumns} data={partners} isLoading={loading} />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Editar Interlocutor' : 'Nuevo Interlocutor'}
        maxWidth="5xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* TABS */}
          <div className="flex border-b border-line dark:border-ink-700 text-sm font-bold text-ink-500 dark:text-ink-400">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`px-6 py-3 border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'general' ? 'border-accent text-accent bg-white dark:bg-ink-800' : 'border-transparent hover:text-accent dark:hover:text-accent'}`}
            >
              <FileText size={16} /> General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('contact')}
              className={`px-6 py-3 border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'contact' ? 'border-accent text-accent bg-white dark:bg-ink-800' : 'border-transparent hover:text-accent dark:hover:text-accent'}`}
            >
              <Contact size={16} /> Contacto
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('addresses')}
              className={`px-6 py-3 border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'addresses' ? 'border-accent text-accent bg-white dark:bg-ink-800' : 'border-transparent hover:text-accent dark:hover:text-accent'}`}
            >
              <MapPin size={16} /> Direcciones{' '}
              <Badge variant="neutral" className="ml-1 scale-75">
                {addresses.length}
              </Badge>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('fiscal')}
              className={`px-6 py-3 border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'fiscal' ? 'border-accent text-accent bg-white dark:bg-ink-800' : 'border-transparent hover:text-accent dark:hover:text-accent'}`}
            >
              <Landmark size={16} /> Fiscal
            </button>
          </div>

          <div className="min-h-[300px]">
            {/* PESTAÑA GENERAL */}
            {activeTab === 'general' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                      Grupo de Socios *
                    </label>
                    <select
                      required
                      value={formData.groupId}
                      onChange={(e) => setFormData({ ...formData, groupId: e.target.value })}
                      className="flex w-full h-10 rounded-[2px] border border-[var(--k-line)] dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] text-[var(--k-ink-900)] dark:text-slate-100 px-3 transition-colors focus-visible:outline-none focus-visible:border-accent"
                    >
                      <option value="">Seleccionar Grupo...</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} ({g.codePrefix})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                      Código (Autogenerado por Sistema)
                    </label>
                    <Input
                      placeholder="Se asignará automáticamente al guardar..."
                      value={formData.code}
                      readOnly
                      className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                      País del cliente
                    </label>
                    <CountrySelect
                      value={formData.countryCode}
                      onChange={(code) => setFormData({ ...formData, countryCode: code })}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                      Razón Social *
                    </label>
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Nombre Legal"
                    />
                  </div>
                  <div className="col-span-2">
                    <TaxIdInput
                      countryCode={formData.countryCode}
                      value={formData.nif}
                      onChange={(v) => setFormData({ ...formData, nif: v })}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                    Nombre Extranjero / Comercial
                  </label>
                  <Input
                    value={formData.foreignName}
                    onChange={(e) => setFormData({ ...formData, foreignName: e.target.value })}
                    placeholder="Nombre alternativo o alias..."
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                    Tarifa Comercial Asociada
                  </label>
                  <select
                    value={formData.priceListId}
                    onChange={(e) => setFormData({ ...formData, priceListId: e.target.value })}
                    className="flex w-full h-10 rounded-[2px] border border-[var(--k-line)] dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] text-[var(--k-ink-900)] dark:text-slate-100 px-3 transition-colors focus-visible:outline-none focus-visible:border-accent"
                  >
                    <option value="">Tarifa Estándar (Sin descuento)</option>
                    {priceLists.map((pl) => (
                      <option key={pl.id} value={pl.id}>
                        {pl.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-medium">
                    Esta tarifa determinará los precios por defecto en pedidos y facturas.
                  </p>
                </div>

              </div>
            )}

            {/* PESTAÑA FISCAL — defaults que se heredan al facturar + banca */}
            {activeTab === 'fiscal' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                <div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400 mb-3">
                    Valores por defecto al facturar
                  </h3>
                  <p className="text-[11px] text-ink-400 dark:text-ink-500 mb-3">
                    Al crear una factura para este interlocutor, estos valores se sugieren
                    automáticamente. Puedes sobreescribirlos en cada factura.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <LookupSelect
                      endpoint="/api/document-types"
                      label="Tipo de documento"
                      value={formData.defaultDocumentTypeId}
                      onChange={(v) => setFormData({ ...formData, defaultDocumentTypeId: v })}
                      headers={{
                        Authorization: `Bearer ${token}`,
                        'x-tenant-id': user?.tenantId || '',
                      }}
                    />
                    <LookupSelect
                      endpoint="/api/payment-methods"
                      label="Método de pago"
                      value={formData.defaultPaymentMethodId}
                      onChange={(v) => setFormData({ ...formData, defaultPaymentMethodId: v })}
                      headers={{
                        Authorization: `Bearer ${token}`,
                        'x-tenant-id': user?.tenantId || '',
                      }}
                    />
                    <LookupSelect
                      endpoint="/api/payment-terms"
                      label="Plazo de pago"
                      value={formData.defaultPaymentTermId}
                      onChange={(v) => setFormData({ ...formData, defaultPaymentTermId: v })}
                      headers={{
                        Authorization: `Bearer ${token}`,
                        'x-tenant-id': user?.tenantId || '',
                      }}
                    />
                    <div>
                      <label className="text-xs font-bold text-ink-500 dark:text-ink-400 mb-1 block">
                        Retención %
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.defaultWithholdingRate}
                        onChange={(e) =>
                          setFormData({ ...formData, defaultWithholdingRate: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-line dark:border-ink-700">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-ink-500 dark:text-ink-400 mb-3">
                    Cuenta bancaria principal
                  </h3>
                  <p className="text-[11px] text-ink-400 dark:text-ink-500 mb-3">
                    IBAN al que se envían los cobros/pagos de este interlocutor. Próximamente
                    podrás registrar varias cuentas por interlocutor.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-bold text-ink-500 dark:text-ink-400 mb-1 block">
                        IBAN
                      </label>
                      <Input
                        value={formData.iban}
                        onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                        onBlur={(e) =>
                          setFormData({ ...formData, iban: formatIban(e.target.value) })
                        }
                        placeholder="ES91 2100 0418 45 0200051332"
                      />
                      {formData.iban?.trim() &&
                        (() => {
                          const res = validateIban(formData.iban);
                          return res.ok ? (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                              ✓ IBAN válido
                            </p>
                          ) : (
                            <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-mono">
                              ⚠ {res.reason}
                            </p>
                          );
                        })()}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-ink-500 dark:text-ink-400 mb-1 block">
                          Banco
                        </label>
                        <Input
                          value={formData.bankName}
                          onChange={(e) =>
                            setFormData({ ...formData, bankName: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-ink-500 dark:text-ink-400 mb-1 block">
                          SWIFT / BIC
                        </label>
                        <Input
                          value={formData.bankSwift}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bankSwift: e.target.value.toUpperCase(),
                            })
                          }
                          placeholder="CAIXESBBXXX"
                        />
                        {formData.bankSwift?.trim() &&
                          (() => {
                            const res = validateSwift(formData.bankSwift);
                            return res.ok ? (
                              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                                ✓ SWIFT válido
                              </p>
                            ) : (
                              <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-mono">
                                ⚠ {res.reason}
                              </p>
                            );
                          })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA CONTACTO */}
            {activeTab === 'contact' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="grid grid-cols-2 gap-4">
                  <PhoneInput
                    countryCode={formData.countryCode}
                    value={formData.phone}
                    onChange={(v) => setFormData({ ...formData, phone: v })}
                    label="Teléfono Principal"
                  />
                  <div>
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                      Correo Electrónico
                    </label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="admin@empresa.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 block">
                    Sitio Web
                  </label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}

            {/* PESTAÑA DIRECCIONES */}
            {activeTab === 'addresses' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addAddress}
                    className="text-xs"
                  >
                    + Nueva Dirección
                  </Button>
                </div>
                {addresses.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 dark:text-slate-500 text-sm border-2 border-dashed rounded-lg">
                    No hay direcciones definidas. Añade una dirección de facturación o envío.
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                    {addresses.map((addr, idx) => (
                      <div
                        key={idx}
                        className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50/50 dark:bg-slate-800/50 relative group"
                      >
                        <button
                          type="button"
                          onClick={() => removeAddress(idx)}
                          className="absolute top-4 right-4 text-slate-400 dark:text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={16} />
                        </button>
                        <div className="grid grid-cols-12 gap-3 mb-3">
                          <div className="col-span-4">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              ID Nombre
                            </label>
                            <Input
                              required
                              value={addr.name}
                              onChange={(e) => updateAddress(idx, 'name', e.target.value)}
                              placeholder="Ej: Principal"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              Tipo
                            </label>
                            <select
                              value={addr.type}
                              onChange={(e) => updateAddress(idx, 'type', e.target.value)}
                              className="w-full h-8 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-md px-2 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            >
                              <option value="B">Facturación (B)</option>
                              <option value="S">Envío (S)</option>
                            </select>
                          </div>
                          <div className="col-span-5 flex items-end pb-1.5 gap-2">
                            <input
                              type="checkbox"
                              checked={addr.isDefault}
                              onChange={(e) => updateAddress(idx, 'isDefault', e.target.checked)}
                              className="rounded text-blue-600 dark:text-blue-300 focus:ring-blue-500"
                            />
                            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              Por defecto para su tipo
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-12 gap-3">
                          <div className="col-span-12">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              Calle y Número
                            </label>
                            <Input
                              value={addr.street}
                              onChange={(e) => updateAddress(idx, 'street', e.target.value)}
                              placeholder="C/ Falsa 123..."
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                              País
                            </label>
                            <CountrySelect
                              value={addr.countryCode || 'ES'}
                              onChange={(code) => {
                                updateAddress(idx, 'countryCode', code);
                                updateAddress(idx, 'subRegionId', '');
                                updateAddress(idx, 'localityId', '');
                                updateAddress(idx, 'city', '');
                              }}
                            />
                          </div>
                          <div className="col-span-8">
                            <SubRegionSelect
                              countryCode={addr.countryCode || 'ES'}
                              value={addr.subRegionId || ''}
                              onChange={(id) => {
                                updateAddress(idx, 'subRegionId', id);
                                updateAddress(idx, 'localityId', '');
                                updateAddress(idx, 'city', '');
                              }}
                              label="Provincia"
                            />
                          </div>
                          <div className="col-span-8">
                            <LocalitySelect
                              subRegionId={addr.subRegionId || ''}
                              value={addr.localityId || ''}
                              valueName={addr.city}
                              onChange={(loc) => {
                                updateAddress(idx, 'localityId', loc?.id || '');
                                updateAddress(idx, 'city', loc?.name || '');
                              }}
                              label="Municipio"
                            />
                          </div>
                          <div className="col-span-4">
                            <PostalCodeInput
                              countryCode={addr.countryCode || 'ES'}
                              value={addr.zipCode}
                              onChange={(v) => updateAddress(idx, 'zipCode', v)}
                              label="C.P."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {editingId && (
            <div className="mt-4">
              <AttachmentsPanel entityType="BusinessPartner" entityId={editingId} />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canWrite}>
              {editingId ? 'Guardar Cambios' : 'Crear Interlocutor'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

/** Select que carga opciones de un endpoint /api/... y las muestra como dropdown. */
const LookupSelect: React.FC<{
  endpoint: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  headers: Record<string, string>;
}> = ({ endpoint, label, value, onChange, headers }) => {
  const [options, setOptions] = useState<Array<{ id: string; code?: string; name: string }>>([]);
  useEffect(() => {
    fetch(endpoint, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setOptions(Array.isArray(data) ? data : []))
      .catch(() => setOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);
  return (
    <div>
      <label className="text-xs font-bold text-ink-500 dark:text-ink-400 mb-1 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex w-full h-10 rounded-[2px] border border-[var(--k-line)] dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] text-[var(--k-ink-900)] dark:text-slate-100 px-3 transition-colors focus-visible:outline-none focus-visible:border-accent"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.code ? `${o.code} · ${o.name}` : o.name}
          </option>
        ))}
      </select>
    </div>
  );
};
