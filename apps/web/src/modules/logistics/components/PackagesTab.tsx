import { packagesApi, stagingAreasApi } from '../api';
import { itemsApi } from '@/modules/inventory/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  NumberInput,
  Modal,
  Badge,
  EmptyState,
  SearchableSelect,
  Table,
  useToast,
  usePopup,
} from '@openfactu/ui';
import type { RowAction, TableColumn } from '@openfactu/ui';
import { Plus, Trash2, Lock, Boxes, Package as PackageIcon, Printer } from 'lucide-react';
import { openPdf } from '@/utils/downloadPdf';
import { packageTone } from '../domain/packageStatus';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { Package, PackageLine } from '../domain/package';
import type { StagingArea } from '../domain/stagingArea';
import type { Item } from '@/modules/inventory/domain/item';

export const PackagesTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();
  const [rows, setRows] = useState<Package[]>([]);
  const [boxes, setBoxes] = useState<Item[]>([]);
  const [areas, setAreas] = useState<StagingArea[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({});
  const [linesFor, setLinesFor] = useState<Package | null>(null);
  const [lines, setLines] = useState<PackageLine[]>([]);
  const [newLineItemId, setNewLineItemId] = useState('');
  // number puro: antes era string porque venía de `e.target.value` de un
  // <input type="number">; con NumberInput el valor ya llega numérico y `null`
  // representa el campo vacío.
  const [newLineQty, setNewLineQty] = useState<number | null>(1);

  const load = async () => {
    setLoading(true);
    const [p, i, a] = await Promise.all([
      packagesApi.list().catch(() => []),
      itemsApi.list().catch(() => []),
      stagingAreasApi.list().catch(() => []),
    ]);
    setRows(Array.isArray(p) ? p : []);
    const items = Array.isArray(i) ? i : [];
    setAllItems(items);
    setBoxes(items.filter((x) => x.kind === 'box'));
    setAreas(Array.isArray(a) ? a : []);
    setLoading(false);
  };

  const openLines = async (pkg: Package) => {
    setLinesFor(pkg);
    try {
      const d = await packagesApi.listLines(pkg.id);
      setLines(Array.isArray(d) ? d : []);
    } catch {
      setLines([]);
    }
    setNewLineItemId('');
    setNewLineQty(1);
  };

  const addLine = async () => {
    if (!linesFor || !newLineItemId) return;
    const qty = newLineQty ?? 0;
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error(t('logistics.packages.invalidQty'));
      return;
    }
    try {
      await packagesApi.addLine(linesFor.id, { itemId: newLineItemId, quantity: qty });
      toast.success(t('logistics.packages.itemAdded'));
      const d = await packagesApi.listLines(linesFor.id);
      setLines(Array.isArray(d) ? d : []);
      setNewLineItemId('');
      setNewLineQty(1);
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.packages.addError'));
    }
  };

  const removeLine = async (lineId: string) => {
    if (!linesFor) return;
    await packagesApi.removeLine(linesFor.id, lineId);
    setLines((xs) => xs.filter((x) => x.id !== lineId));
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const create = async () => {
    try {
      const d = await packagesApi.create(form);
      toast.success(t('logistics.packages.created', { code: d.code }));
      setShowModal(false);
      setForm({});
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.common.error'));
    }
  };

  const seal = async (id: string) => {
    await packagesApi.update(id, { status: 'sealed' });
    toast.success(t('logistics.packages.sealed'));
    load();
  };

  const moveToArea = async (id: string, stagingAreaId: string | null) => {
    const area = stagingAreaId ? areas.find((a) => a.id === stagingAreaId) : null;
    try {
      await packagesApi.update(id, { stagingAreaId });
      toast.success(
        area
          ? t('logistics.packages.movedTo', { name: area.name })
          : t('logistics.packages.removedFromArea'),
      );
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.packages.moveError'));
    }
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: t('logistics.packages.deleteTitle'),
      message: t('logistics.packages.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('logistics.common.delete'),
    });
    if (!ok) return;
    await packagesApi.remove(id);
    load();
  };

  const boxMap = new Map(boxes.map((b) => [b.id, b] as const));

  // Opciones de los desplegables de maestros: una vez por render en lugar de
  // una por fila de la lista.
  const areaOptions = useMemo(
    () => areas.map((a) => ({ value: a.id, label: a.name, secondaryLabel: a.code })),
    [areas],
  );
  const boxOptions = useMemo(
    () => boxes.map((b) => ({ value: b.id, label: b.name, secondaryLabel: b.code })),
    [boxes],
  );
  const contentItemOptions = useMemo(
    () =>
      allItems
        // No metes cajas dentro de cajas.
        .filter((i) => i.kind !== 'box')
        .map((i) => ({ value: i.id, label: i.name, secondaryLabel: i.code })),
    [allItems],
  );

  const columns: TableColumn<Package>[] = [
    {
      header: t('logistics.packages.columns.code'),
      cell: (p) => <span className="font-mono text-xs text-fg-default">{p.code}</span>,
    },
    {
      header: t('logistics.packages.columns.status'),
      cell: (p) => (
        <Badge variant={packageTone(p.status)}>{t(`logistics.packages.status.${p.status}`)}</Badge>
      ),
    },
    {
      header: t('logistics.packages.columns.shipment'),
      cell: (p) => (
        <div>
          <div className="font-mono text-xs">{(p.shipmentCode as string) || '—'}</div>
          <div className="text-xs text-fg-muted truncate max-w-[240px]">
            {(p.counterparty as string) || ''}
          </div>
        </div>
      ),
    },
    {
      header: t('logistics.packages.columns.box'),
      cell: (p) => {
        const box = p.boxItemId ? boxMap.get(p.boxItemId) : null;
        return (
          <span className="text-xs text-fg-muted">
            {[box?.name, p.weightKg != null ? `${p.weightKg} kg` : null]
              .filter(Boolean)
              .join(' · ') || '—'}
          </span>
        );
      },
    },
    {
      header: t('logistics.packages.area'),
      cell: (p) => (
        <SearchableSelect
          options={areaOptions}
          value={p.stagingAreaId || ''}
          onChange={(v) => moveToArea(p.id, v || null)}
          disabled={p.status === 'shipped' || p.status === 'delivered'}
          placeholder={t('logistics.packages.noArea')}
          clearable
          className="w-44"
        />
      ),
    },
  ];

  const rowActions = (p: Package): RowAction[] => [
    {
      label: t('logistics.packages.boxContents'),
      icon: <Boxes size={14} />,
      onClick: () => openLines(p),
    },
    {
      label: t('logistics.packages.label'),
      icon: <Printer size={14} />,
      onClick: () => openPdf(`/api/logistics/packages/${p.id}/label.pdf`),
    },
    ...(p.status === 'open'
      ? [
          {
            label: t('logistics.packages.seal'),
            icon: <Lock size={14} />,
            onClick: () => seal(p.id),
          },
        ]
      : []),
    {
      label: t('logistics.common.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => remove(p.id),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
          <Plus size={14} /> {t('logistics.packages.new')}
        </Button>
      </div>

      {!loading && rows.length === 0 ? (
        <Card bodyClassName="py-10">
          <EmptyState icon={<PackageIcon size={28} />} title={t('logistics.packages.empty')} />
        </Card>
      ) : (
        <Card noPadding className="overflow-hidden">
          <Table
            className="max-md:p-3"
            columns={columns}
            data={rows}
            isLoading={loading}
            rowActions={rowActions}
            skeletonRowHeight={24}
          />
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={t('logistics.packages.new')}
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            {/* Artículos y acopios vienen del servidor → SearchableSelect (no
                tiene prop `label`, se conserva el <label> suelto). */}
            <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
              {t('logistics.packages.boxField')}
            </label>
            <SearchableSelect
              options={boxOptions}
              value={form.boxItemId || ''}
              onChange={(v) => setForm({ ...form, boxItemId: v || null })}
              placeholder={t('logistics.packages.noBox')}
              clearable
            />
            {boxes.length === 0 && (
              <p className="text-[11px] text-warning mt-1">{t('logistics.packages.noBoxes')}</p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
              {t('logistics.packages.area')}
            </label>
            <SearchableSelect
              options={areaOptions}
              value={form.stagingAreaId || ''}
              onChange={(v) => setForm({ ...form, stagingAreaId: v || null })}
              placeholder={t('logistics.packages.noArea')}
              clearable
            />
          </div>
          {/* `weightKg` es doublePrecision en el servidor: llega y se envía
              numérico, y el campo vacío queda en null. */}
          <NumberInput
            label={t('logistics.packages.weight')}
            value={form.weightKg ?? null}
            onChange={(v) => setForm({ ...form, weightKg: v })}
            precision={2}
            min={0}
          />
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {t('logistics.common.cancel')}
            </Button>
            <Button onClick={create}>{t('logistics.common.create')}</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!linesFor}
        onClose={() => setLinesFor(null)}
        title={t('logistics.packages.contentsTitle', { code: linesFor?.code || '' })}
        subtitle={t('logistics.packages.contentsSubtitle')}
        maxWidth="lg"
      >
        {linesFor && (
          <div className="space-y-3 pt-4">
            {/* Formulario de añadir artículo */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-fg-muted block mb-1">
                  {t('logistics.packages.item')}
                </label>
                <SearchableSelect
                  options={contentItemOptions}
                  value={newLineItemId}
                  onChange={setNewLineItemId}
                  placeholder={t('logistics.common.selectPlaceholder')}
                  clearable
                />
              </div>
              <NumberInput
                label={t('logistics.packages.quantity')}
                value={newLineQty}
                onChange={setNewLineQty}
                precision={2}
                min={0}
                containerClassName="w-24"
              />
              <Button
                onClick={addLine}
                disabled={
                  !newLineItemId || linesFor.status === 'shipped' || linesFor.status === 'delivered'
                }
                className="flex items-center gap-1"
              >
                <Plus size={14} /> {t('logistics.common.add')}
              </Button>
            </div>

            {(linesFor.status === 'shipped' || linesFor.status === 'delivered') && (
              <p className="text-[11px] text-warning ">{t('logistics.packages.boxShipped')}</p>
            )}

            {/* Lista de contenido actual */}
            {lines.length === 0 ? (
              <Card bodyClassName="py-8 text-center text-sm text-fg-muted">
                {t('logistics.packages.emptyBox')}
              </Card>
            ) : (
              <Card bodyClassName="p-0">
                <ul>
                  {lines.map((l) => {
                    const it = allItems.find((x) => x.id === l.itemId);
                    return (
                      <li
                        key={l.id}
                        className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-0"
                      >
                        <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                          {it?.code || '—'}
                        </code>
                        <span className="flex-1 text-sm text-fg-default truncate">
                          {it?.name || l.itemId}
                        </span>
                        <span className="text-[11px] font-bold tabular-nums text-fg-body">
                          {Number(l.quantity).toFixed(2)} {it?.uomCode ? String(it.uomCode) : ''}
                        </span>
                        {linesFor.status !== 'shipped' && linesFor.status !== 'delivered' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(l.id)}
                            title={t('logistics.common.remove')}
                          >
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <div className="text-[11px] text-fg-muted flex items-center justify-between pt-2 border-t border-border-subtle">
              <span>
                {t('logistics.packages.totalLines')} <b>{lines.length}</b>
              </span>
              <span>
                {t('logistics.packages.totalUnits')}{' '}
                <b>{lines.reduce((acc, l) => acc + Number(l.quantity || 0), 0).toFixed(2)}</b>
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
