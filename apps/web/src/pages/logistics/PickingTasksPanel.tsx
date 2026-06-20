/**
 * Panel reutilizable de tareas de picking de un Shipment.
 * Permite editar `pickedQty` por línea y marcar tareas como done / missing.
 * Si la tarea trae un `batchNumber` preasignado desde el albarán, lo muestra
 * como chip prominente — el operario sabe exactamente qué lote/serie coger.
 */
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Badge, Loader, useToast } from '@openfactu/ui';
import { Check, X, Layers3, Package, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface PickingTask {
  id: string;
  itemId: string | null;
  requestedQty: number;
  pickedQty: number;
  status: 'pending' | 'partial' | 'done' | 'missing';
  batchNumber: string | null;
  notes: string | null;
  warehouseId: string | null;
  zoneId: string | null;
}

interface Props {
  shipmentId: string;
  onAllDone?: () => void;
}

const STATUS_BADGE: Record<string, any> = {
  pending: 'neutral',
  partial: 'warning',
  done: 'success',
  missing: 'danger',
};

export const PickingTasksPanel: React.FC<Props> = ({ shipmentId, onAllDone }) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    const [tRes, iRes] = await Promise.all([
      fetch(`/api/logistics/prep/tasks?shipmentId=${shipmentId}`, { headers }).then((r) =>
        r.ok ? r.json() : [],
      ),
      fetch('/api/items', { headers }).then((r) => (r.ok ? r.json() : [])),
    ]);
    setTasks(Array.isArray(tRes) ? tRes : []);
    setItems(Array.isArray(iRes) ? iRes : []);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, shipmentId]);

  const patchTask = async (id: string, patch: any) => {
    try {
      const res = await fetch(`/api/logistics/prep/tasks/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('[PickingTasks] PATCH error', res.status, d);
        toast.error(d.error || `Error ${res.status} al actualizar la tarea`);
        return;
      }
      // Confirmación visible al usuario según la acción.
      if (patch.status === 'missing') toast.success('Marcada como no disponible');
      else if (patch.status === 'done') toast.success('Tarea completada');
      else if ('pickedQty' in patch) toast.success('Cantidad guardada');
      await load();
    } catch (e: any) {
      console.error('[PickingTasks] PATCH exception', e);
      toast.error(e?.message || 'Error de red');
      return;
    }
    if (onAllDone) {
      // Comprueba tras recargar si todo terminó.
      setTimeout(() => {
        setTasks((curr) => {
          const allDone =
            curr.length > 0 && curr.every((t) => t.status === 'done' || t.status === 'missing');
          if (allDone) onAllDone();
          return curr;
        });
      }, 400);
    }
  };

  const itemMap = new Map(items.map((i) => [i.id, i] as const));

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'missing').length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  if (loading) {
    return (
      <div className="py-10 flex justify-center">
        <Loader />
      </div>
    );
  }

  const resync = async () => {
    if (
      !confirm(
        'Resincronizar tareas con el albarán: las tareas pendientes se regeneran con los lotes/series actuales del albarán. Las ya pickeadas se conservan.',
      )
    )
      return;
    const res = await fetch(`/api/logistics/prep/shipments/${shipmentId}/resync`, {
      method: 'POST',
      headers,
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Error al resincronizar');
      return;
    }
    toast.success(
      `Resincronizado — ${d.added} añadidas, ${d.deleted} eliminadas, ${d.preserved} preservadas`,
    );
    load();
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
          <span>
            Progreso: <b>{done}</b> / {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resync}
              title="Regenerar tareas pendientes con los lotes/series actuales del albarán"
              className="inline-flex items-center gap-1 h-6 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.1em] hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm active:scale-[0.97] transition-all"
            >
              <RefreshCw size={10} />
              Sincronizar
            </button>
            <span>{progress}%</span>
          </div>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {tasks.length === 0 ? (
        <Card bodyClassName="py-8 text-center text-sm text-slate-500">
          Sin tareas para este envío.
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {tasks.map((t) => {
              const it = t.itemId ? itemMap.get(t.itemId) : null;
              const manageBy = it?.manageBy;
              const hasBatch = !!t.batchNumber;
              const BatchIcon = manageBy === 'S' ? Layers3 : Package;
              return (
                <li
                  key={t.id}
                  className="px-4 py-2 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_BADGE[t.status] || 'neutral'}>{t.status}</Badge>
                    <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                      {it?.code || t.itemId || '—'}
                    </code>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 min-w-0 truncate">
                      {it?.name || '—'}
                    </span>
                    {hasBatch && (
                      <span
                        className="inline-flex items-center gap-1.5 h-6 pl-1.5 pr-2 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-[0.1em]"
                        title={
                          manageBy === 'S'
                            ? 'Serie asignada en el albarán'
                            : 'Lote asignado en el albarán'
                        }
                      >
                        <BatchIcon size={11} />
                        <span className="font-mono normal-case tracking-normal">
                          {t.batchNumber}
                        </span>
                      </span>
                    )}
                    <span className="flex-1" />
                    <span className="text-[11px] text-slate-500">
                      Pedido: <b>{t.requestedQty}</b>
                    </span>
                    <Input
                      type="number"
                      step="0.01"
                      value={t.pickedQty}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setTasks((xs) =>
                          xs.map((x) => (x.id === t.id ? { ...x, pickedQty: v } : x)),
                        );
                      }}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== t.pickedQty) return; // ya reflejado
                        // disparado sobre el mismo valor — ignorar
                      }}
                      className="w-20"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => patchTask(t.id, { pickedQty: t.pickedQty })}
                      className="!px-2 !py-1"
                      title="Guardar cantidad"
                    >
                      Guardar
                    </Button>
                    <button
                      onClick={() => patchTask(t.id, { status: 'done', pickedQty: t.requestedQty })}
                      className="p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded"
                      title="Completado"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => patchTask(t.id, { status: 'missing' })}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
                      title="No disponible"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {/* El input de Lote/serie solo aparece si el artículo se
                        gestiona por lotes ('B') o series ('S'). Para artículos
                        sin trazabilidad ('N' o null) no tiene sentido. */}
                    {(manageBy === 'B' || manageBy === 'S') && (
                      <Input
                        placeholder={manageBy === 'S' ? 'Nº de serie' : 'Lote'}
                        value={t.batchNumber || ''}
                        onChange={(e) =>
                          setTasks((xs) =>
                            xs.map((x) =>
                              x.id === t.id ? { ...x, batchNumber: e.target.value } : x,
                            ),
                          )
                        }
                        onBlur={() => patchTask(t.id, { batchNumber: t.batchNumber })}
                        className="w-40 text-xs"
                      />
                    )}
                    <Input
                      placeholder="Notas"
                      value={t.notes || ''}
                      onChange={(e) =>
                        setTasks((xs) =>
                          xs.map((x) => (x.id === t.id ? { ...x, notes: e.target.value } : x)),
                        )
                      }
                      onBlur={() => patchTask(t.id, { notes: t.notes })}
                      className="flex-1 text-xs"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
};
