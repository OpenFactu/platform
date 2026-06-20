import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Modal, Badge, Loader, useToast } from '@openfactu/ui';
import { Plus, Trash2, Lock, Warehouse, Boxes } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface PackageLine {
  id: string;
  packageId: string;
  itemId: string;
  quantity: number;
  sourceLineId: string | null;
}

const STATUS_BADGE: Record<string, any> = {
  open: 'warning',
  sealed: 'info',
  shipped: 'info',
  delivered: 'success',
  returned: 'danger',
};

export const PackagesTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({});
  const [linesFor, setLinesFor] = useState<any | null>(null);
  const [lines, setLines] = useState<PackageLine[]>([]);
  const [newLineItemId, setNewLineItemId] = useState('');
  const [newLineQty, setNewLineQty] = useState<string>('1');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    const [p, i, a] = await Promise.all([
      fetch('/api/logistics/packages', { headers }).then((r) => r.json()),
      fetch('/api/items', { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/logistics/staging-areas', { headers }).then((r) => (r.ok ? r.json() : [])),
    ]);
    setRows(Array.isArray(p) ? p : []);
    const items = Array.isArray(i) ? i : [];
    setAllItems(items);
    setBoxes(items.filter((x: any) => x.kind === 'box'));
    setAreas(Array.isArray(a) ? a : []);
    setLoading(false);
  };

  const openLines = async (pkg: any) => {
    setLinesFor(pkg);
    const r = await fetch(`/api/logistics/packages/${pkg.id}/lines`, { headers });
    const d = await r.json().catch(() => []);
    setLines(Array.isArray(d) ? d : []);
    setNewLineItemId('');
    setNewLineQty('1');
  };

  const addLine = async () => {
    if (!linesFor || !newLineItemId) return;
    const qty = Number(newLineQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Cantidad inválida');
      return;
    }
    const res = await fetch(`/api/logistics/packages/${linesFor.id}/lines`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ itemId: newLineItemId, quantity: qty }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || 'Error al añadir');
      return;
    }
    toast.success('Artículo añadido');
    const r = await fetch(`/api/logistics/packages/${linesFor.id}/lines`, { headers });
    setLines(await r.json());
    setNewLineItemId('');
    setNewLineQty('1');
  };

  const removeLine = async (lineId: string) => {
    if (!linesFor) return;
    await fetch(`/api/logistics/packages/${linesFor.id}/lines/${lineId}`, {
      method: 'DELETE',
      headers,
    });
    setLines((xs) => xs.filter((x) => x.id !== lineId));
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const create = async () => {
    const res = await fetch('/api/logistics/packages', {
      method: 'POST',
      headers,
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    toast.success(`Paquete ${d.code} creado`);
    setShowModal(false);
    setForm({});
    load();
  };

  const seal = async (id: string) => {
    await fetch(`/api/logistics/packages/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'sealed' }),
    });
    toast.success('Paquete sellado');
    load();
  };

  const moveToArea = async (id: string, stagingAreaId: string | null) => {
    const area = stagingAreaId ? areas.find((a) => a.id === stagingAreaId) : null;
    const res = await fetch(`/api/logistics/packages/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ stagingAreaId }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || 'Error al mover');
      return;
    }
    toast.success(area ? `Movido a ${area.name}` : 'Sacado del acopio');
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('¿Eliminar paquete?')) return;
    await fetch(`/api/logistics/packages/${id}`, { method: 'DELETE', headers });
    load();
  };

  const boxMap = new Map(boxes.map((b) => [b.id, b] as const));
  const areaMap = new Map(areas.map((a) => [a.id, a] as const));

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
                className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
              >
                <Badge variant={STATUS_BADGE[p.status] || 'neutral'}>{p.status}</Badge>
                <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
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

                {/* Selector inline para mover el paquete entre acopios. */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Warehouse size={13} className="text-slate-400" />
                  <select
                    value={p.stagingAreaId || ''}
                    onChange={(e) => moveToArea(p.id, e.target.value || null)}
                    disabled={p.status === 'shipped' || p.status === 'delivered'}
                    className="h-7 px-2 text-[11px] font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Mover a un acopio"
                  >
                    <option value="">— sin acopio —</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => openLines(p)}
                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                  title="Contenido de la caja"
                >
                  <Boxes size={13} />
                </button>
                {p.status === 'open' && (
                  <button
                    onClick={() => seal(p.id)}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded"
                    title="Sellar"
                  >
                    <Lock size={13} />
                  </button>
                )}
                <button
                  onClick={() => remove(p.id)}
                  className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                >
                  <Trash2 size={13} />
                </button>
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
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Caja (artículo tipo box)
            </label>
            <select
              value={form.boxItemId || ''}
              onChange={(e) => setForm({ ...form, boxItemId: e.target.value || null })}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
            >
              <option value="">— sin caja —</option>
              {boxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} · {b.name}
                </option>
              ))}
            </select>
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
            <select
              value={form.stagingAreaId || ''}
              onChange={(e) => setForm({ ...form, stagingAreaId: e.target.value || null })}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
            >
              <option value="">— sin acopio —</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Peso (kg)
            </label>
            <Input
              type="number"
              step="0.01"
              value={form.weightKg ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  weightKg: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
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
                <select
                  value={newLineItemId}
                  onChange={(e) => setNewLineItemId(e.target.value)}
                  className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
                >
                  <option value="">— seleccionar —</option>
                  {allItems
                    .filter((i) => i.kind !== 'box') // no metes cajas dentro de cajas
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} · {i.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="w-24">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                  Cantidad
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={newLineQty}
                  onChange={(e) => setNewLineQty(e.target.value)}
                />
              </div>
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
                        className="flex items-center gap-3 px-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                      >
                        <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                          {it?.code || '—'}
                        </code>
                        <span className="flex-1 text-sm text-slate-800 dark:text-slate-100 truncate">
                          {it?.name || l.itemId}
                        </span>
                        <span className="text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                          {Number(l.quantity).toFixed(2)} {it?.uomCode || ''}
                        </span>
                        {linesFor.status !== 'shipped' && linesFor.status !== 'delivered' && (
                          <button
                            onClick={() => removeLine(l.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                            title="Quitar"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}

            <div className="text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
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
