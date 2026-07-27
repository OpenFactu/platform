import { packagesApi, stagingAreasApi } from '../api';
import { itemsApi } from '@/modules/inventory/api';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  NumberInput,
  Modal,
  Badge,
  Loader,
  SearchableSelect,
  useToast,
  usePopup,
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { Plus, Trash2, Lock, Warehouse, Boxes } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import type { Package, PackageLine } from '../domain/package';
import type { StagingArea } from '../domain/stagingArea';
import type { Item } from '@/modules/inventory/domain/item';

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  open: 'warning',
  sealed: 'info',
  shipped: 'info',
  delivered: 'success',
  returned: 'error',
};

export const PackagesTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
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
      toast.error('Cantidad inválida');
      return;
    }
    try {
      await packagesApi.addLine(linesFor.id, { itemId: newLineItemId, quantity: qty });
      toast.success('Artículo añadido');
      const d = await packagesApi.listLines(linesFor.id);
      setLines(Array.isArray(d) ? d : []);
      setNewLineItemId('');
      setNewLineQty(1);
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error al añadir');
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
      toast.success(`Paquete ${d.code} creado`);
      setShowModal(false);
      setForm({});
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error');
    }
  };

  const seal = async (id: string) => {
    await packagesApi.update(id, { status: 'sealed' });
    toast.success('Paquete sellado');
    load();
  };

  const moveToArea = async (id: string, stagingAreaId: string | null) => {
    const area = stagingAreaId ? areas.find((a) => a.id === stagingAreaId) : null;
    try {
      await packagesApi.update(id, { stagingAreaId });
      toast.success(area ? `Movido a ${area.name}` : 'Sacado del acopio');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'Error al mover');
    }
  };

  const remove = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar paquete',
      message: '¿Eliminar el paquete?',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    await packagesApi.remove(id);
    load();
  };

  const boxMap = new Map(boxes.map((b) => [b.id, b] as const));
  const areaMap = new Map(areas.map((a) => [a.id, a] as const));

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo paquete
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : rows.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">Sin paquetes.</Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {rows.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border-subtle last:border-0"
              >
                <Badge variant={STATUS_BADGE[p.status] || 'neutral'}>{p.status}</Badge>
                <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                  {p.code}
                </code>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                    {p.boxItemId && boxMap.get(p.boxItemId) && (
                      <span>Caja: {boxMap.get(p.boxItemId)!.name}</span>
                    )}
                    {p.weightKg != null && <span>· {p.weightKg} kg</span>}
                  </div>
                </div>

                {/* Selector inline para mover el paquete entre acopios: los
                    acopios vienen del servidor → SearchableSelect. */}
                <div className="flex items-center gap-1.5 shrink-0" title="Mover a un acopio">
                  <Warehouse size={13} className="text-slate-400" />
                  <SearchableSelect
                    options={areaOptions}
                    value={p.stagingAreaId || ''}
                    onChange={(v) => moveToArea(p.id, v || null)}
                    disabled={p.status === 'shipped' || p.status === 'delivered'}
                    placeholder="— sin acopio —"
                    clearable
                    className="w-44"
                  />
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openLines(p)}
                  title="Contenido de la caja"
                >
                  <Boxes size={13} />
                </Button>
                {p.status === 'open' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => seal(p.id)}
                    title="Sellar"
                  >
                    <Lock size={13} />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(p.id)}
                  title="Eliminar"
                >
                  <Trash2 size={13} />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Nuevo paquete"
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            {/* Artículos y acopios vienen del servidor → SearchableSelect (no
                tiene prop `label`, se conserva el <label> suelto). */}
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Caja (artículo tipo box)
            </label>
            <SearchableSelect
              options={boxOptions}
              value={form.boxItemId || ''}
              onChange={(v) => setForm({ ...form, boxItemId: v || null })}
              placeholder="— sin caja —"
              clearable
            />
            {boxes.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                No hay artículos marcados como caja. Edita un artículo y actívalo como caja.
              </p>
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Acopio
            </label>
            <SearchableSelect
              options={areaOptions}
              value={form.stagingAreaId || ''}
              onChange={(v) => setForm({ ...form, stagingAreaId: v || null })}
              placeholder="— sin acopio —"
              clearable
            />
          </div>
          {/* `weightKg` es doublePrecision en el servidor: llega y se envía
              numérico, y el campo vacío queda en null. */}
          <NumberInput
            label="Peso (kg)"
            value={form.weightKg ?? null}
            onChange={(v) => setForm({ ...form, weightKg: v })}
            precision={2}
            min={0}
          />
          <div className="flex justify-end gap-2 pt-4 border-t border-border-subtle">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={create}>Crear</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!linesFor}
        onClose={() => setLinesFor(null)}
        title={`Contenido · ${linesFor?.code || ''}`}
        subtitle="Artículos que van dentro de esta caja. Mueve unidades entrando o saliendo."
        maxWidth="lg"
      >
        {linesFor && (
          <div className="space-y-3 pt-4">
            {/* Formulario de añadir artículo */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Artículo
                </label>
                <SearchableSelect
                  options={contentItemOptions}
                  value={newLineItemId}
                  onChange={setNewLineItemId}
                  placeholder="— seleccionar —"
                  clearable
                />
              </div>
              <NumberInput
                label="Cantidad"
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
                <Plus size={14} /> Añadir
              </Button>
            </div>

            {(linesFor.status === 'shipped' || linesFor.status === 'delivered') && (
              <p className="text-[11px] text-amber-600 dark:text-amber-300">
                La caja ya ha salido — el contenido no se puede modificar.
              </p>
            )}

            {/* Lista de contenido actual */}
            {lines.length === 0 ? (
              <Card bodyClassName="py-8 text-center text-sm text-slate-500">Caja vacía.</Card>
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
                            title="Quitar"
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

            <div className="text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-border-subtle">
              <span>
                Total líneas: <b>{lines.length}</b>
              </span>
              <span>
                Total unidades:{' '}
                <b>{lines.reduce((acc, l) => acc + Number(l.quantity || 0), 0).toFixed(2)}</b>
              </span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
