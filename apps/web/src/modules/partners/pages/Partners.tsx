import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { validateIban, validateSwift, formatIban } from '@/utils/bankValidation';
import {
  Table,
  Card,
  Button,
  Input,
  Modal,
  useToast,
  Badge,
  SearchableSelect,
  Checkbox,
  Tabs,
  EmptyState,
  SearchInput,
} from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import {
  Users,
  Plus,
  MapPin,
  Contact,
  FileText,
  Trash2,
  Edit2,
  Landmark,
  Search,
  Check,
} from 'lucide-react';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useGeo, type GeoRow } from '@/hooks/useGeo';
import { TaxIdInput } from '@/components/geo/TaxIdInput';
import { PostalCodeInput } from '@/components/geo/PostalCodeInput';
import { PhoneInput } from '@/components/geo/PhoneInput';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import { usePluginListColumns } from '@/components/plugin-fields';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { crudApi } from '@/shared/api';
import { partnersApi, partnerGroupsApi } from '../api';
import type { Partner, PartnerAddress, PartnerGroup } from '../domain/partner';

const FLAGS: Record<string, string> = {
  ES: '🇪🇸',
  PT: '🇵🇹',
  FR: '🇫🇷',
  IT: '🇮🇹',
  DE: '🇩🇪',
  GB: '🇬🇧',
  US: '🇺🇸',
};

const labelCls = 'text-xs font-semibold text-fg-muted mb-1 block';
const descCls = 'text-xs text-fg-subtle mt-1';
const sectionTitleCls = 'text-xs font-bold uppercase tracking-wider text-fg-muted mb-3';
const sectionDescCls = 'text-xs text-fg-subtle mb-3';
const dividerCls = 'border-t border-border-default';
const footerCls = 'flex justify-end gap-3 pt-4 border-t border-border-default';

const TABS = [
  { key: 'general', label: 'General', icon: FileText },
  { key: 'contact', label: 'Contacto', icon: Contact },
  { key: 'addresses', label: 'Direcciones', icon: MapPin },
  { key: 'fiscal', label: 'Fiscal', icon: Landmark },
] as const;

/* ── MunicipalitySearch: remote-search autocomplete (SearchableSelect no soporta búsqueda remota) ── */

interface MunicipalitySearchProps {
  subRegionId: string;
  value: string;
  valueName?: string;
  onChange: (locality: GeoRow | null) => void;
  label?: string;
  disabled?: boolean;
  onSearch: (subRegionId: string, query: string) => Promise<GeoRow[]>;
}

const MunicipalitySearch: React.FC<MunicipalitySearchProps> = ({
  subRegionId,
  value,
  valueName,
  onChange,
  label,
  disabled,
  onSearch,
}) => {
  const [query, setQuery] = useState(valueName || '');
  const [results, setResults] = useState<GeoRow[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setQuery(valueName || '');
  }, [valueName]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!subRegionId || query.trim().length < 1) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await onSearch(subRegionId, query));
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(debounceRef.current);
  }, [subRegionId, query, onSearch]);

  const selected = results.find((r) => r.id === value);

  return (
    <div ref={wrapperRef} className="relative">
      {/* El icono de lupa lo pinta `leftIcon`; el <label> pasa a la prop `label`,
          igual que en el PostalCodeInput de al lado. */}
      <Input
        label={label}
        type="text"
        value={query}
        disabled={disabled || !subRegionId}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={subRegionId ? 'Buscar municipio...' : 'Selecciona antes la provincia'}
        leftIcon={<Search size={14} />}
      />
      {open && subRegionId && query.trim().length >= 1 && (
        <div className="absolute left-0 right-0 top-full z-[100999] bg-bg-card border border-border-default shadow-lg max-h-52 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-slate-400 italic">Buscando…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400 italic">Sin resultados</div>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(r);
                      setQuery(r.name);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-bg-hover flex items-center justify-between text-fg-body"
                  >
                    <span>{r.name}</span>
                    {r.id === value && <Check size={14} className="text-accent" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Partners Page ─────────────────────────────────────────────────────── */

export const Partners: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const toast = useToast();
  const { countries, loadSubRegionsByCountry, searchLocalities } = useGeo();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [groups, setGroups] = useState<PartnerGroup[]>([]);
  const [priceLists, setPriceLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'contact' | 'addresses' | 'fiscal'>(
    'general',
  );
  const [editingId, setEditingId] = useState<string | null>(null);

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
    defaultDocumentTypeId: '',
    defaultPaymentMethodId: '',
    defaultPaymentTermId: '',
    defaultWithholdingRate: '' as string | number,
    iban: '',
    bankName: '',
    bankSwift: '',
  });
  const [addresses, setAddresses] = useState<PartnerAddress[]>([]);

  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentTerms, setPaymentTerms] = useState<any[]>([]);

  const [subRegions, setSubRegions] = useState<Record<number, GeoRow[]>>({});
  const [subRegionsLoading, setSubRegionsLoading] = useState<Record<number, boolean>>({});

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const data = await partnersApi.list();
      setPartners(data);
    } catch {
      toast.error('Error al cargar interlocutores');
    } finally {
      setLoading(false);
    }
  };

  // Lookups de otros módulos (tarifas, formas/términos de pago, tipos de
  // documento) — van por el adaptador genérico para no acoplar este módulo.
  const fetchLookup = async (endpoint: string, setter: (d: any[]) => void) => {
    try {
      const data = await crudApi.list<any>(endpoint);
      setter(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    fetchPartners();
    partnerGroupsApi
      .list()
      .then((d) => setGroups(Array.isArray(d) ? d : []))
      .catch(() => {});
    fetchLookup('/api/pricelists', setPriceLists);
    fetchLookup('/api/document-types', setDocTypes);
    fetchLookup('/api/payment-methods', setPaymentMethods);
    fetchLookup('/api/payment-terms', setPaymentTerms);
  }, [user?.tenantId]);

  const loadSubRegionsForAddress = useCallback(
    async (idx: number, countryCode: string) => {
      if (!countryCode) return;
      setSubRegionsLoading((p) => ({ ...p, [idx]: true }));
      try {
        const data = await loadSubRegionsByCountry(countryCode);
        setSubRegions((p) => ({ ...p, [idx]: data }));
      } catch {
        setSubRegions((p) => ({ ...p, [idx]: [] }));
      } finally {
        setSubRegionsLoading((p) => ({ ...p, [idx]: false }));
      }
    },
    [loadSubRegionsByCountry],
  );

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
    const idx = addresses.length;
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
    loadSubRegionsForAddress(idx, formData.countryCode || 'ES');
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

  const removeAddress = (idx: number) => setAddresses(addresses.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.groupId) return toast.error('Nombre y Grupo son obligatorios');
    try {
      const payload = { ...formData, addresses };
      if (editingId) await partnersApi.update(editingId, payload);
      else await partnersApi.create(payload);
      toast.success(editingId ? 'Interlocutor actualizado' : 'Interlocutor creado');
      setIsModalOpen(false);
      fetchPartners();
    } catch (err) {
      toast.error(err instanceof Error ? `Error: ${err.message}` : 'Error de red al guardar socio');
    }
  };

  const columns = [
    {
      header: 'Código',
      sortable: true,
      sortAccessor: (i: any) => i.code ?? '',
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
          {p.name}
          {p.foreignName && (
            <span className="text-fg-subtle font-normal text-xs ml-1">({p.foreignName})</span>
          )}
        </span>
      ),
    },
    { header: 'NIF/VAT', cell: (p: any) => p.nif },
    {
      header: 'Grupo',
      sortable: true,
      sortAccessor: (i: any) => i.groupName ?? '',
      cell: (p: any) => groups.find((g) => g.id === p.groupId)?.name || '-',
    },
    { header: 'Contacto', cell: (p: any) => p.email || p.phone || '-' },
    {
      header: 'Direcciones',
      cell: (p: any) => <Badge variant="info">{p.addresses?.length || 0}</Badge>,
    },
  ];

  const pluginCols = usePluginListColumns('BusinessPartner');
  const allColumns = [...columns, ...pluginCols];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que el permiso de escritura se
  // declara una vez en lugar de duplicarse entre una columna de botones y el menú.
  const rowActions = (p: any): RowAction[] => [
    {
      label: 'Editar',
      icon: <Edit2 size={14} />,
      disabled: !canWrite,
      onClick: () => openModal(p),
    },
  ];

  const countryOptions = countries.map((c) => ({
    label: `${FLAGS[c.code] || ''} ${c.name}`,
    value: c.code,
  }));

  /**
   * Filtro en cliente: el listado viene entero del servidor, así que basta con
   * cribarlo aquí. Busca por todas las columnas visibles a la vez — código,
   * razón social (y su nombre extranjero), NIF, grupo y contacto — porque el
   * usuario no tiene por qué saber en cuál de ellas está lo que recuerda.
   */
  const visiblePartners = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return partners;
    const groupName = (p: any) => groups.find((g) => g.id === p.groupId)?.name || '';
    return partners.filter((p: any) =>
      [p.code, p.name, p.foreignName, p.nif, p.email, p.phone, groupName(p)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [partners, groups, search]);

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-fg-default flex items-center gap-3 tracking-tight">
            <Users className="text-blue-600 dark:text-blue-300" size={32} />
            Interlocutores
          </h1>
          <p className="text-fg-muted mt-1 font-medium">
            Gestión centralizada de Clientes y Proveedores.
          </p>
        </div>
        <Button
          onClick={() => openModal()}
          disabled={!canWrite}
          className="flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:grayscale transition-all"
        >
          <Plus size={18} /> Nuevo Interlocutor
        </Button>
      </div>

      <Card className="overflow-hidden" noPadding>
        <div className="p-3 border-b border-border-subtle">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, razón social, NIF, grupo o contacto…"
            clearable
            className="max-w-md"
          />
        </div>
        <Table
          columns={allColumns}
          data={visiblePartners}
          isLoading={loading}
          rowActions={rowActions}
          emptyMessage={
            search ? `Ningún interlocutor coincide con “${search}”.` : 'Aún no hay interlocutores.'
          }
        />
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Editar Interlocutor' : 'Nuevo Interlocutor'}
        maxWidth="5xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Tabs variant="underline" reproduce el subrayado que se pintaba a mano
              y añade la navegación con flechas del patrón WAI-ARIA tablist. */}
          <Tabs
            items={TABS.map((t) => ({
              key: t.key,
              label: t.label,
              icon: <t.icon size={15} />,
              badge:
                t.key === 'addresses' && addresses.length > 0 ? (
                  <Badge variant="neutral" className="ml-1 scale-75">
                    {addresses.length}
                  </Badge>
                ) : undefined,
            }))}
            value={activeTab}
            onChange={(key) => setActiveTab(key as typeof activeTab)}
          />

          <div className="min-h-[300px]">
            {activeTab === 'general' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Grupo de Socios *</label>
                    <SearchableSelect
                      value={formData.groupId}
                      onChange={(v) => setFormData({ ...formData, groupId: v })}
                      options={groups.map((g) => ({
                        label: `${g.name} (${g.codePrefix})`,
                        value: g.id,
                      }))}
                      placeholder="Seleccionar Grupo..."
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Código</label>
                    <Input
                      placeholder="Se asignará automáticamente..."
                      value={formData.code}
                      readOnly
                      className="bg-bg-muted text-fg-muted font-mono"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>País</label>
                    <SearchableSelect
                      value={formData.countryCode}
                      onChange={(code) => setFormData({ ...formData, countryCode: code })}
                      options={countryOptions}
                      placeholder="Seleccionar país..."
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Razón Social *</label>
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
                  <label className={labelCls}>Nombre Extranjero / Comercial</label>
                  <Input
                    value={formData.foreignName}
                    onChange={(e) => setFormData({ ...formData, foreignName: e.target.value })}
                    placeholder="Nombre alternativo o alias..."
                  />
                </div>
                <div>
                  <label className={labelCls}>Tarifa Comercial</label>
                  <SearchableSelect
                    value={formData.priceListId}
                    onChange={(v) => setFormData({ ...formData, priceListId: v })}
                    options={[
                      { label: 'Tarifa Estándar (Sin descuento)', value: '' },
                      ...priceLists.map((pl) => ({ label: pl.name, value: pl.id })),
                    ]}
                    placeholder="Seleccionar tarifa..."
                  />
                  <p className={descCls}>
                    Esta tarifa determinará los precios por defecto en pedidos y facturas.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'fiscal' && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                <div>
                  <h3 className={sectionTitleCls}>Valores por defecto al facturar</h3>
                  <p className={sectionDescCls}>
                    Se sugieren automáticamente al crear una factura. Puedes sobreescribirlos en
                    cada factura.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Tipo de documento</label>
                      <SearchableSelect
                        value={formData.defaultDocumentTypeId}
                        onChange={(v) => setFormData({ ...formData, defaultDocumentTypeId: v })}
                        options={docTypes.map((d) => ({
                          label: d.code ? `${d.code} · ${d.name}` : d.name,
                          value: d.id,
                        }))}
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Método de pago</label>
                      <SearchableSelect
                        value={formData.defaultPaymentMethodId}
                        onChange={(v) => setFormData({ ...formData, defaultPaymentMethodId: v })}
                        options={paymentMethods.map((m) => ({
                          label: m.code ? `${m.code} · ${m.name}` : m.name,
                          value: m.id,
                        }))}
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Plazo de pago</label>
                      <SearchableSelect
                        value={formData.defaultPaymentTermId}
                        onChange={(v) => setFormData({ ...formData, defaultPaymentTermId: v })}
                        options={paymentTerms.map((t) => ({
                          label: t.code ? `${t.code} · ${t.name}` : t.name,
                          value: t.id,
                        }))}
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Retención %</label>
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
                <div className={`pt-4 ${dividerCls}`}>
                  <h3 className={sectionTitleCls}>Cuenta bancaria principal</h3>
                  <p className={sectionDescCls}>
                    IBAN para cobros/pagos. Próximamente podrás registrar varias cuentas.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>IBAN</label>
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
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                              ✓ IBAN válido
                            </p>
                          ) : (
                            <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-mono">
                              {' '}
                              {res.reason}
                            </p>
                          );
                        })()}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={labelCls}>Banco</label>
                        <Input
                          value={formData.bankName}
                          onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>SWIFT / BIC</label>
                        <Input
                          value={formData.bankSwift}
                          onChange={(e) =>
                            setFormData({ ...formData, bankSwift: e.target.value.toUpperCase() })
                          }
                          placeholder="CAIXESBBXXX"
                        />
                        {formData.bankSwift?.trim() &&
                          (() => {
                            const res = validateSwift(formData.bankSwift);
                            return res.ok ? (
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                                ✓ SWIFT válido
                              </p>
                            ) : (
                              <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-mono">
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
                    <label className={labelCls}>Correo Electrónico</label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="admin@empresa.com"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Sitio Web</label>
                  <Input
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'addresses' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" size="sm" onClick={addAddress}>
                    + Nueva Dirección
                  </Button>
                </div>
                {addresses.length === 0 ? (
                  <EmptyState
                    icon={<MapPin size={28} />}
                    title="No hay direcciones definidas"
                    hint="Añade una dirección de facturación o envío."
                    action={
                      <Button type="button" variant="secondary" size="sm" onClick={addAddress}>
                        + Nueva Dirección
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {addresses.map((addr, idx) => {
                      const addrSubRegions = subRegions[idx] || [];
                      const addrSubLoading = subRegionsLoading[idx] || false;

                      return (
                        <div
                          key={idx}
                          className="border border-border-default rounded-lg p-4 bg-bg-muted relative group"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeAddress(idx)}
                            title="Quitar dirección"
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={15} />
                          </Button>

                          <div className="grid grid-cols-3 gap-3 mb-3">
                            <div>
                              <label className={labelCls}>Nombre</label>
                              <Input
                                required
                                value={addr.name}
                                onChange={(e) => updateAddress(idx, 'name', e.target.value)}
                                placeholder="Ej: Principal"
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Tipo</label>
                              <SearchableSelect
                                value={addr.type}
                                onChange={(v) => updateAddress(idx, 'type', v)}
                                options={[
                                  { label: 'Facturación (B)', value: 'B' },
                                  { label: 'Envío (S)', value: 'S' },
                                ]}
                              />
                            </div>
                            <div className="flex items-end gap-2 pb-2">
                              <Checkbox
                                checked={addr.isDefault}
                                onChange={(v) => updateAddress(idx, 'isDefault', v)}
                              />
                              <span className={labelCls}>Por defecto</span>
                            </div>
                          </div>

                          <div className="mb-3">
                            <label className={labelCls}>Calle</label>
                            <Input
                              value={addr.street}
                              onChange={(e) => updateAddress(idx, 'street', e.target.value)}
                              placeholder="C/ Falsa 123..."
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className={labelCls}>País</label>
                              <SearchableSelect
                                value={addr.countryCode || 'ES'}
                                onChange={(code) => {
                                  updateAddress(idx, 'countryCode', code);
                                  updateAddress(idx, 'subRegionId', '');
                                  updateAddress(idx, 'localityId', '');
                                  updateAddress(idx, 'city', '');
                                  loadSubRegionsForAddress(idx, code);
                                }}
                                options={countryOptions}
                                placeholder="Seleccionar país..."
                              />
                            </div>
                            <div>
                              <label className={labelCls}>Provincia</label>
                              <SearchableSelect
                                value={String(addr.subRegionId || '')}
                                onChange={(id) => {
                                  updateAddress(idx, 'subRegionId', id);
                                  updateAddress(idx, 'localityId', '');
                                  updateAddress(idx, 'city', '');
                                }}
                                options={addrSubRegions.map((r) => ({
                                  label: r.name,
                                  value: r.id,
                                }))}
                                placeholder={
                                  addrSubLoading ? 'Cargando...' : 'Seleccionar provincia...'
                                }
                                disabled={addrSubLoading || addrSubRegions.length === 0}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <MunicipalitySearch
                                subRegionId={String(addr.subRegionId || '')}
                                value={String(addr.localityId || '')}
                                valueName={addr.city}
                                onChange={(loc) => {
                                  updateAddress(idx, 'localityId', loc?.id || '');
                                  updateAddress(idx, 'city', loc?.name || '');
                                }}
                                label="Municipio"
                                disabled={!addr.subRegionId}
                                onSearch={searchLocalities}
                              />
                            </div>
                            <div>
                              <PostalCodeInput
                                countryCode={addr.countryCode || 'ES'}
                                value={addr.zipCode}
                                onChange={(v) => updateAddress(idx, 'zipCode', v)}
                                label="C.P."
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {editingId && (
            <div className="mt-2">
              <AttachmentsPanel entityType="BusinessPartner" entityId={editingId} />
            </div>
          )}

          <div className={footerCls}>
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
