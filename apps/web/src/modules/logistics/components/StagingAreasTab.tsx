import { packagesApi, platformsApi, stagingAreasApi } from '../api';
import { itemsApi, warehousesApi } from '@/modules/inventory/api';
import { partnersApi } from '@/modules/partners/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  NumberInput,
  Modal,
  Loader,
  Badge,
  useToast,
  usePopup,
  DropdownMenu,
  SearchableSelect,
  EmptyState,
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import {
  Plus,
  Trash2,
  QrCode,
  Edit2,
  MoreVertical,
  Package as PackageIcon,
  Boxes,
  Printer,
  Tag,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { openPdf } from '@/utils/downloadPdf';
import { formatDate, formatDateTime } from '@/i18n/format';
import type { Platform } from '../domain/platform';
import type { StagingArea, StagingAreaItem } from '../domain/stagingArea';
import type { Package } from '../domain/package';
import type { Item } from '@/modules/inventory/domain/item';
import type { Warehouse } from '@/modules/inventory/domain/warehouse';
import type { Partner } from '@/modules/partners/domain/partner';

export const StagingAreasTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<StagingArea[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StagingArea | null>(null);
  const [form, setForm] = useState<any>({});
  const [qrFor, setQrFor] = useState<{
    id: string;
    name: string;
    payload: any;
    imgUrl: string | null;
  } | null>(null);
  const [itemsFor, setItemsFor] = useState<StagingArea | null>(null);
  const [areaItems, setAreaItems] = useState<StagingAreaItem[]>([]);
  const [pkgsFor, setPkgsFor] = useState<StagingArea | null>(null);
  const [areaPackages, setAreaPackages] = useState<Package[]>([]);
  const [newItemId, setNewItemId] = useState('');
  // number puro: antes era string porque venía de `e.target.value` de un
  // <input type="number">; con NumberInput el valor ya llega numérico y `null`
  // es el campo vacío (la qty esperada es opcional).
  const [newItemQty, setNewItemQty] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [r, w, p, it, pl] = await Promise.all([
      stagingAreasApi.list().catch(() => []),
      warehousesApi.list().catch(() => []),
      partnersApi.list().catch(() => []),
      itemsApi.list().catch(() => []),
      platformsApi.list().catch(() => []),
    ]);
    setRows(Array.isArray(r) ? r : []);
    setWarehouses(Array.isArray(w) ? w : []);
    setPartners(Array.isArray(p) ? p : []);
    setItems(Array.isArray(it) ? it : []);
    setPlatforms(Array.isArray(pl) ? pl : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setShowModal(true);
  };
  const openEdit = (a: StagingArea) => {
    setEditing(a);
    setForm({ ...a });
    setShowModal(true);
  };

  const save = async () => {
    // El nombre es opcional: si no se rellena, el backend lo genera como
    // "Acopio <cliente>" si hay partnerId, o con el código como último
    // recurso. Así el usuario no está obligado a inventar un nombre.
    try {
      const d = editing
        ? await stagingAreasApi.update(editing.id, form)
        : await stagingAreasApi.create(form);
      toast.success(
        editing ? t('logistics.staging.updated') : t('logistics.staging.created', { code: d.code }),
      );
      setShowModal(false);
      setForm({});
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: t('logistics.staging.deleteTitle'),
      message: t('logistics.staging.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('logistics.common.delete'),
    });
    if (!ok) return;
    await stagingAreasApi.remove(id);
    load();
  };

  const openQr = async (area: StagingArea) => {
    // Petición autenticada (el <img> no enviaría headers) → blob URL.
    const payload = await stagingAreasApi.payload(area.id).catch(() => ({}));
    let imgUrl: string | null = null;
    try {
      const { blob } = await stagingAreasApi.qrPng(area.id);
      imgUrl = URL.createObjectURL(blob);
    } catch {
      toast.error(t('logistics.staging.qrLoadError'));
    }
    setQrFor({ id: area.id, name: area.name, payload, imgUrl });
  };

  const openPackingList = (area: Pick<StagingArea, 'id'>) =>
    openPdf(`/api/logistics/staging-areas/${area.id}/packing-list.pdf`);

  const openPackageLabels = (area: Pick<StagingArea, 'id'>) =>
    openPdf(`/api/logistics/staging-areas/${area.id}/labels.pdf`);

  const closeQr = () => {
    // Liberar memoria del blob URL al cerrar el modal.
    if (qrFor?.imgUrl) URL.revokeObjectURL(qrFor.imgUrl);
    setQrFor(null);
  };

  const downloadQr = () => {
    if (!qrFor?.imgUrl) return;
    const a = document.createElement('a');
    a.href = qrFor.imgUrl;
    a.download = `qr-${qrFor.name}.png`;
    a.click();
  };

  const openItems = async (area: StagingArea) => {
    setItemsFor(area);
    try {
      const list = await stagingAreasApi.listItems(area.id);
      setAreaItems(Array.isArray(list) ? list : []);
    } catch {
      setAreaItems([]);
    }
    setNewItemId('');
    setNewItemQty(null);
  };

  const openPackages = async (area: StagingArea) => {
    setPkgsFor(area);
    // Filtramos client-side: no hay endpoint específico, pero GET /packages
    // devuelve todos — filtramos por stagingAreaId.
    const list = await packagesApi.list().catch(() => []);
    setAreaPackages((Array.isArray(list) ? list : []).filter((p) => p.stagingAreaId === area.id));
  };

  const PKG_BADGE: Record<string, BadgeProps['variant']> = {
    open: 'warning',
    sealed: 'info',
    shipped: 'info',
    delivered: 'success',
    returned: 'error',
  };

  const addItem = async () => {
    if (!itemsFor || !newItemId) return;
    try {
      // `expectedQty` es doublePrecision en el servidor: se envía el number tal
      // cual (o null si el campo quedó vacío).
      await stagingAreasApi.addItem(itemsFor.id, {
        itemId: newItemId,
        expectedQty: newItemQty,
      });
      toast.success(t('logistics.staging.itemAdded'));
      setNewItemId('');
      setNewItemQty(null);
      const list = await stagingAreasApi.listItems(itemsFor.id);
      setAreaItems(Array.isArray(list) ? list : []);
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const removeItem = async (rowId: string) => {
    if (!itemsFor) return;
    await stagingAreasApi.removeItem(itemsFor.id, rowId);
    setAreaItems((xs) => xs.filter((x) => x.id !== rowId));
  };

  const partnerMap = new Map(partners.map((p) => [p.id, p] as const));
  const itemMap = new Map(items.map((i) => [i.id, i] as const));
  const whMap = new Map(warehouses.map((w) => [w.id, w] as const));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus size={14} /> {t('logistics.staging.new')}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Boxes size={24} />}
            title={t('logistics.staging.emptyTitle')}
            hint={t('logistics.staging.emptyHint')}
          />
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((a) => {
              const partner = a.partnerId ? partnerMap.get(a.partnerId) : null;
              const wh = a.warehouseId ? whMap.get(a.warehouseId) : null;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0"
                >
                  <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded shrink-0">
                    {a.code}
                  </code>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-fg-default truncate">
                        {a.name}
                      </span>
                      {partner && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-info-bg text-info shrink-0">
                          {partner.name}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-muted mt-0.5 flex gap-3 flex-wrap">
                      {wh && (
                        <span>{t('logistics.staging.warehouseLabel', { name: wh.name })}</span>
                      )}
                      {a.address && <span className="truncate max-w-sm">{a.address}</span>}
                    </div>
                  </div>

                  {/* Acciones críticas — siempre visibles. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openPackages(a)}
                    title={t('logistics.staging.packagesHint')}
                    className="shrink-0"
                  >
                    <Boxes size={13} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => openQr(a)}
                    title={t('logistics.staging.qrHint')}
                    className="shrink-0"
                  >
                    <QrCode size={13} />
                  </Button>

                  {/* Resto — kebab, no rompe en móvil. */}
                  <DropdownMenu
                    align="end"
                    items={[
                      {
                        label: t('logistics.staging.menu.items'),
                        icon: <PackageIcon size={14} />,
                        onClick: () => openItems(a),
                      },
                      {
                        label: t('logistics.staging.menu.packingList'),
                        icon: <Printer size={14} />,
                        onClick: () => openPackingList(a),
                      },
                      {
                        label: t('logistics.staging.menu.labels4'),
                        icon: <Tag size={14} />,
                        onClick: () => openPackageLabels(a),
                      },
                      {
                        label: t('logistics.common.edit'),
                        icon: <Edit2 size={14} />,
                        onClick: () => openEdit(a),
                      },
                      {
                        label: t('logistics.common.delete'),
                        icon: <Trash2 size={14} />,
                        onClick: () => remove(a.id),
                        destructive: true,
                      },
                    ]}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      title={t('logistics.staging.moreActions')}
                      className="shrink-0"
                    >
                      <MoreVertical size={13} />
                    </Button>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? t('logistics.staging.editTitle') : t('logistics.staging.new')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            {/* Clientes vienen del servidor y son muchos → SearchableSelect (no
                tiene prop `label`, se conserva el <label> suelto). */}
            <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
              {t('logistics.staging.form.owner')}
            </label>
            <SearchableSelect
              options={partners.map((p) => ({
                value: p.id,
                label: p.name,
                secondaryLabel: p.code || undefined,
              }))}
              value={form.partnerId || ''}
              onChange={(v) => setForm({ ...form, partnerId: v || null })}
              placeholder={t('logistics.staging.form.sharedPlaceholder')}
              clearable
            />
            <p className="text-[11px] text-fg-muted mt-1 leading-relaxed">
              {t('logistics.staging.form.ownerHint.p1')}{' '}
              <b>{t('logistics.staging.form.ownerHint.b1')}</b>{' '}
              {t('logistics.staging.form.ownerHint.p2')}{' '}
              <b>{t('logistics.staging.form.ownerHint.b2')}</b>{' '}
              {t('logistics.staging.form.ownerHint.p3')}{' '}
              <b>{t('logistics.staging.form.ownerHint.b3')}</b>{' '}
              {t('logistics.staging.form.ownerHint.p4')}
            </p>
          </div>
          <div>
            <Input
              label={t('logistics.staging.form.name')}
              value={form.name || ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={
                form.partnerId
                  ? t('logistics.staging.form.namePlaceholderPartner', {
                      name: partners.find((p) => p.id === form.partnerId)?.name || '',
                    })
                  : t('logistics.staging.form.namePlaceholder')
              }
            />
            <p className="text-[11px] text-fg-muted mt-1">
              {t('logistics.staging.form.nameHintBefore')}{' '}
              <b>{t('logistics.staging.form.nameHintPattern')}</b>{' '}
              {t('logistics.staging.form.nameHintAfter')}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              {/* Almacenes y plataformas vienen del servidor →
                  SearchableSelect (sin prop `label`). */}
              <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
                {t('logistics.staging.form.ownWarehouse')}
              </label>
              <SearchableSelect
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                value={form.warehouseId || ''}
                onChange={(v) => setForm({ ...form, warehouseId: v || null })}
                placeholder="—"
                clearable
              />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
                {t('logistics.staging.form.externalPlatform')}
              </label>
              <SearchableSelect
                options={platforms.map((p) => ({
                  value: p.id,
                  label: p.name,
                  secondaryLabel: p.code,
                }))}
                value={form.platformId || ''}
                onChange={(val) => {
                  const id = val || null;
                  const pl = id ? platforms.find((p) => p.id === id) : null;
                  setForm((prev: any) => {
                    const next: any = { ...prev, platformId: id };
                    // Heredar dirección/coords de la plataforma si aún están vacíos.
                    if (pl) {
                      if (!prev.address && pl.address) next.address = pl.address;
                      if (prev.lat == null && pl.lat != null) next.lat = pl.lat;
                      if (prev.lng == null && pl.lng != null) next.lng = pl.lng;
                    }
                    return next;
                  });
                }}
                placeholder="—"
                clearable
              />
            </div>
          </div>
          <p className="text-[11px] text-fg-muted -mt-1 leading-relaxed">
            {t('logistics.staging.form.locationHint.p1')}{' '}
            <b>{t('logistics.staging.form.ownWarehouse')}</b>{' '}
            {t('logistics.staging.form.locationHint.p2')}{' '}
            <b>{t('logistics.staging.form.externalPlatform')}</b>{' '}
            {t('logistics.staging.form.locationHint.p3')}
          </p>
          <Input
            label={t('logistics.staging.form.address')}
            value={form.address || ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder={t('logistics.staging.form.addressPlaceholder')}
            helperText={t('logistics.staging.form.addressHelp')}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* `lat`/`lng` son doublePrecision en el servidor: llegan y se
                envían numéricas, y el campo vacío queda en null. */}
            <NumberInput
              label={t('logistics.staging.form.latitude')}
              value={form.lat ?? null}
              onChange={(v) => setForm({ ...form, lat: v })}
              precision={6}
              thousandSeparator={false}
              allowNegative
              placeholder="40.4168"
            />
            <NumberInput
              label={t('logistics.staging.form.longitude')}
              value={form.lng ?? null}
              onChange={(v) => setForm({ ...form, lng: v })}
              precision={6}
              thousandSeparator={false}
              allowNegative
              placeholder="-3.7038"
            />
          </div>
          <p className="text-[11px] text-fg-muted -mt-2">
            {t('logistics.staging.form.coordsHint')}
          </p>
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('logistics.common.cancel')}
            </Button>
            <Button onClick={save}>
              {editing ? t('logistics.common.save') : t('logistics.common.create')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!itemsFor}
        onClose={() => setItemsFor(null)}
        title={t('logistics.staging.items.title', { name: itemsFor?.name || '' })}
        subtitle={t('logistics.staging.items.subtitle')}
        maxWidth="lg"
      >
        {itemsFor && (
          <div className="space-y-3 pt-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                {/* Artículos del servidor → SearchableSelect (sin `label`). */}
                <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
                  {t('logistics.staging.items.item')}
                </label>
                <SearchableSelect
                  options={items
                    .filter((i) => !areaItems.some((ai) => ai.itemId === i.id))
                    .map((i) => ({ value: i.id, label: i.name, secondaryLabel: i.code }))}
                  value={newItemId}
                  onChange={setNewItemId}
                  placeholder={t('logistics.common.selectPlaceholder')}
                  clearable
                />
              </div>
              <NumberInput
                label={t('logistics.staging.items.expectedQty')}
                value={newItemQty}
                onChange={setNewItemQty}
                precision={2}
                min={0}
                placeholder="—"
                containerClassName="w-32"
              />
              <Button type="button" onClick={addItem} disabled={!newItemId}>
                {t('logistics.common.add')}
              </Button>
            </div>

            {areaItems.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<PackageIcon size={24} />}
                  title={t('logistics.staging.items.empty')}
                />
              </Card>
            ) : (
              <Card bodyClassName="p-0">
                <ul>
                  {areaItems.map((ai) => {
                    const it = itemMap.get(ai.itemId);
                    return (
                      <li
                        key={ai.id}
                        className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-0"
                      >
                        <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                          {it?.code || '—'}
                        </code>
                        <span className="flex-1 text-sm text-fg-default">
                          {it?.name || ai.itemId}
                        </span>
                        {ai.expectedQty != null && (
                          <span className="text-[11px] text-fg-muted">
                            {t('logistics.staging.items.target', { qty: ai.expectedQty })}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(ai.id)}
                          title={t('logistics.common.remove')}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!pkgsFor}
        onClose={() => setPkgsFor(null)}
        title={t('logistics.staging.packages.title', { name: pkgsFor?.name || '' })}
        subtitle={t('logistics.staging.packages.subtitle')}
        maxWidth="lg"
      >
        {pkgsFor && (
          <div className="space-y-3 pt-4">
            {areaPackages.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Boxes size={24} />}
                  title={t('logistics.staging.packages.emptyTitle')}
                  hint={t('logistics.staging.packages.emptyHint')}
                />
              </Card>
            ) : (
              <Card bodyClassName="p-0">
                <ul>
                  {areaPackages.map((pk) => (
                    <li
                      key={pk.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0"
                    >
                      <Badge variant={PKG_BADGE[pk.status] || 'neutral'}>{pk.status}</Badge>
                      <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                        {pk.code}
                      </code>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-fg-muted flex gap-3 flex-wrap">
                          {pk.shipmentId && (
                            <span>
                              {t('logistics.staging.packages.shipment')}{' '}
                              <span className="font-mono">{String(pk.shipmentId).slice(0, 8)}</span>
                            </span>
                          )}
                          {pk.weightKg != null && <span>· {pk.weightKg} kg</span>}
                          {pk.sealedAt && (
                            <span>
                              ·{' '}
                              {t('logistics.staging.packages.sealedOn', {
                                date: formatDate(pk.sealedAt),
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <div className="text-[11px] text-fg-muted pt-2 border-t border-border-subtle flex items-center justify-between">
              <span>
                {t('logistics.staging.packages.total')} <b>{areaPackages.length}</b>
              </span>
              <span>
                {t('logistics.staging.packages.uniqueShipments')}{' '}
                <b>{new Set(areaPackages.map((p) => p.shipmentId).filter(Boolean)).size}</b>
              </span>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!qrFor}
        onClose={closeQr}
        title={t('logistics.staging.qr.title', { name: qrFor?.name || '' })}
        subtitle={t('logistics.staging.qr.subtitle')}
        maxWidth="md"
      >
        {qrFor && (
          <div className="space-y-3 pt-4">
            <div className="flex items-center justify-center p-4 bg-bg-card rounded-lg border border-border-subtle">
              {qrFor.imgUrl ? (
                <img src={qrFor.imgUrl} alt="QR" className="w-80 h-80" />
              ) : (
                <div className="w-80 h-80 flex items-center justify-center text-fg-subtle text-sm">
                  {t('logistics.staging.qrLoadError')}
                </div>
              )}
            </div>
            <div className="w-full max-w-md space-y-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-1.5">
                  {t('logistics.staging.qr.assignedRoutes')}
                </div>
                {qrFor.payload.routes?.length ? (
                  <ul className="space-y-1.5">
                    {qrFor.payload.routes.map((r: any) => (
                      <li
                        key={r.id}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-bg-muted border border-border-default"
                      >
                        <code className="px-1.5 py-0.5 bg-bg-card text-[10px] font-mono rounded shadow-sm">
                          {r.code}
                        </code>
                        <span className="flex-1 text-xs font-semibold text-fg-default truncate">
                          {r.name || '—'}
                        </span>
                        <span className="text-[11px] text-fg-muted shrink-0">
                          {r.driverName || t('logistics.staging.noDriver')}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-[11px] text-warning bg-warning-bg border border-warning rounded-lg px-2.5 py-1.5">
                    {t('logistics.staging.qr.noRoute')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-[11px] text-fg-muted pt-1">
                <span>
                  <b>{qrFor.payload.packages?.length || 0}</b>{' '}
                  {t('logistics.staging.qr.packages', {
                    count: qrFor.payload.packages?.length || 0,
                  })}
                </span>
                <span>
                  <b>{qrFor.payload.shipments?.length || 0}</b>{' '}
                  {t('logistics.staging.qr.shipments', {
                    count: qrFor.payload.shipments?.length || 0,
                  })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {qrFor.imgUrl && (
                <Button type="button" onClick={downloadQr}>
                  <QrCode size={14} /> {t('logistics.staging.qr.download')}
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                onClick={() => qrFor && openPackingList({ id: qrFor.id })}
              >
                <Printer size={14} /> {t('logistics.staging.menu.packingList')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
