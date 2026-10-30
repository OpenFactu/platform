/**
 * Panel reutilizable de tareas de picking de un Shipment.
 * Permite editar `pickedQty` por línea y marcar tareas como done / missing.
 * Si la tarea trae un `batchNumber` preasignado desde el albarán, lo muestra
 * como chip prominente — el operario sabe exactamente qué lote/serie coger.
 */
import { prepTasksApi } from '../api';
import { itemsApi } from '@/modules/inventory/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Button,
  Input,
  NumberInput,
  Badge,
  Loader,
  SearchableSelect,
  useToast,
  usePopup,
  Progress,
} from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { Check, X, Layers3, Package, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import type { PickingTask } from '../domain/prepTask';
import type { BatchOrSerial, Item } from '@/modules/inventory/domain/item';

type BatchOption = BatchOrSerial;

interface Props {
  shipmentId: string;
  onAllDone?: () => void;
}

const STATUS_BADGE: Record<string, BadgeProps['variant']> = {
  pending: 'neutral',
  partial: 'warning',
  done: 'success',
  missing: 'error',
};

export const PickingTasksPanel: React.FC<Props> = ({ shipmentId, onAllDone }) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const popup = usePopup();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<PickingTask[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  // Lotes/series con stock disponible por `${itemId}::${warehouseId}` — para
  // ofrecer alternativas reales al sustituir el lote de una tarea, en vez de
  // un campo de texto libre sin ninguna validación.
  const [batchOptionsByKey, setBatchOptionsByKey] = useState<Map<string, BatchOption[]>>(new Map());

  const load = async () => {
    setLoading(true);
    const [tasksList, itemsList] = await Promise.all([
      prepTasksApi.list(shipmentId).catch(() => []),
      itemsApi.list().catch(() => []),
    ]);
    setTasks(Array.isArray(tasksList) ? tasksList : []);
    setItems(Array.isArray(itemsList) ? itemsList : []);

    // Precarga las opciones de lote/serie disponibles por item+almacén,
    // solo para artículos trazables con almacén conocido.
    const itemMapLocal = new Map(itemsList.map((i) => [i.id, i] as const));
    const keys = new Set<string>();
    for (const t of tasksList) {
      const it = t.itemId ? itemMapLocal.get(t.itemId) : null;
      if ((it?.manageBy === 'B' || it?.manageBy === 'S') && t.itemId && t.warehouseId) {
        keys.add(`${t.itemId}::${t.warehouseId}`);
      }
    }
    const entries = await Promise.all(
      Array.from(keys).map(async (key) => {
        const [itemId, warehouseId] = key.split('::');
        const list = await itemsApi.listWarehouseBatches(itemId, warehouseId).catch(() => []);
        return [key, Array.isArray(list) ? list : []] as const;
      }),
    );
    setBatchOptionsByKey(new Map(entries));
    setLoading(false);
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId, shipmentId]);

  const patchTask = async (id: string, patch: any) => {
    try {
      await prepTasksApi.update(id, patch);
      // Confirmación visible al usuario según la acción.
      if (patch.status === 'missing') toast.success(t('logistics.picking.markedMissing'));
      else if (patch.status === 'done') toast.success(t('logistics.picking.taskDone'));
      else if ('pickedQty' in patch) toast.success(t('logistics.picking.qtySaved'));
      await load();
    } catch (e) {
      console.error('[PickingTasks] PATCH exception', e);
      const msg = e instanceof ApiError ? (e.body as any)?.error : undefined;
      const status = e instanceof ApiError ? e.status : undefined;
      toast.error(
        msg ||
          (status
            ? t('logistics.picking.updateError', { status })
            : t('logistics.picking.networkError')),
      );
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
    const ok = await popup.confirm({
      title: t('logistics.picking.resyncTitle'),
      message: t('logistics.picking.resyncMessage'),
      confirmLabel: t('logistics.picking.resyncConfirm'),
    });
    if (!ok) return;
    try {
      const d = await prepTasksApi.resyncShipment(shipmentId);
      toast.success(
        t('logistics.picking.resynced', {
          added: d.added,
          deleted: d.deleted,
          preserved: d.preserved,
        }),
      );
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.picking.resyncError'));
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
          <span>
            {t('logistics.picking.progress')} <b>{done}</b> / {total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resync}
              title={t('logistics.picking.syncHint')}
            >
              <RefreshCw size={10} />
              {t('logistics.picking.sync')}
            </Button>
            <span>{progress}%</span>
          </div>
        </div>
        <Progress value={progress} variant="success" size="sm" />
      </div>

      {tasks.length === 0 ? (
        <Card bodyClassName="py-8 text-center text-sm text-slate-500">
          {t('logistics.picking.empty')}
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {tasks.map((task) => {
              const it = task.itemId ? itemMap.get(task.itemId) : null;
              const manageBy = it?.manageBy;
              const hasBatch = !!task.batchNumber;
              const BatchIcon = manageBy === 'S' ? Layers3 : Package;
              return (
                <li key={task.id} className="px-4 py-2 border-b border-border-subtle last:border-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_BADGE[task.status] || 'neutral'}>{task.status}</Badge>
                    <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                      {it?.code || task.itemId || '—'}
                    </code>
                    <span className="text-sm font-medium text-fg-default min-w-0 truncate">
                      {it?.name || '—'}
                    </span>
                    {hasBatch && (
                      <span
                        className="inline-flex items-center gap-1.5 h-6 pl-1.5 pr-2 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px] font-black uppercase tracking-[0.1em]"
                        title={
                          manageBy === 'S'
                            ? t('logistics.picking.serialAssigned')
                            : t('logistics.picking.batchAssigned')
                        }
                      >
                        <BatchIcon size={11} />
                        <span className="font-mono normal-case tracking-normal">
                          {task.batchNumber}
                        </span>
                      </span>
                    )}
                    <span className="flex-1" />
                    <span className="text-[11px] text-slate-500">
                      {t('logistics.picking.requested')} <b>{task.requestedQty}</b>
                    </span>
                    {/* `pickedQty` ya es number en PickingTask (el servidor lo
                        devuelve numérico), así que no hace falta convertir; con
                        emptyValue="zero" vaciar el campo deja 0 en vez de null. */}
                    <NumberInput
                      value={task.pickedQty}
                      onChange={(v) =>
                        setTasks((xs) =>
                          xs.map((x) => (x.id === task.id ? { ...x, pickedQty: v ?? 0 } : x)),
                        )
                      }
                      precision={2}
                      min={0}
                      emptyValue="zero"
                      align="right"
                      inputSize="sm"
                      containerClassName="w-20"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => patchTask(task.id, { pickedQty: task.pickedQty })}
                      title={t('logistics.picking.saveQty')}
                    >
                      {t('logistics.common.save')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        patchTask(task.id, { status: 'done', pickedQty: task.requestedQty })
                      }
                      title={t('logistics.picking.completed')}
                    >
                      <Check size={14} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => patchTask(task.id, { status: 'missing' })}
                      title={t('logistics.picking.missing')}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {/* El selector de Lote/serie solo aparece si el artículo se
                        gestiona por lotes ('B') o series ('S'). Para artículos
                        sin trazabilidad ('N' o null) no tiene sentido. Las
                        opciones son los lotes con stock REAL en el almacén de
                        la tarea — al elegir uno distinto, el backend revierte
                        el stock del lote original y lo descuenta del nuevo
                        (ver PATCH /prep/tasks/:id). */}
                    {(manageBy === 'B' || manageBy === 'S') &&
                      (() => {
                        const key =
                          task.itemId && task.warehouseId
                            ? `${task.itemId}::${task.warehouseId}`
                            : '';
                        const available = batchOptionsByKey.get(key) || [];
                        const options = available.map((b) => ({
                          value: b.batchNum,
                          label: b.batchNum,
                          secondaryLabel: t('logistics.picking.available', { qty: b.quantity }),
                        }));
                        // El lote ya asignado debe seguir siendo seleccionable
                        // aunque su stock "disponible" salga en 0 en la
                        // consulta fresca (ya se descontó al crear el
                        // albarán) — si no, desaparecería del desplegable.
                        if (
                          task.batchNumber &&
                          !options.some((o) => o.value === task.batchNumber)
                        ) {
                          options.unshift({
                            value: task.batchNumber,
                            label: task.batchNumber,
                            secondaryLabel: t('logistics.picking.current'),
                          });
                        }
                        return (
                          <SearchableSelect
                            options={options}
                            value={task.batchNumber || ''}
                            onChange={(v) => {
                              setTasks((xs) =>
                                xs.map((x) => (x.id === task.id ? { ...x, batchNumber: v } : x)),
                              );
                              if (v !== task.batchNumber) patchTask(task.id, { batchNumber: v });
                            }}
                            placeholder={
                              manageBy === 'S'
                                ? t('logistics.picking.serialNumber')
                                : t('logistics.picking.batch')
                            }
                            className="w-48 text-xs"
                          />
                        );
                      })()}
                    <Input
                      placeholder={t('logistics.picking.notes')}
                      value={task.notes || ''}
                      onChange={(e) =>
                        setTasks((xs) =>
                          xs.map((x) => (x.id === task.id ? { ...x, notes: e.target.value } : x)),
                        )
                      }
                      onBlur={() => patchTask(task.id, { notes: task.notes })}
                      inputSize="sm"
                      containerClassName="flex-1"
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
