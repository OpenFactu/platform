/**
 * Pestaña de Incidencias — lista todos los envíos en estado `exception` con
 * el motivo reportado por el conductor, y deja resolverlas o convertirlas
 * en devolución. Incluye además las incidencias reportadas por CLIENTES desde
 * el chat público de seguimiento (eventos `kind='incident'`), que no cambian
 * el estado del envío: el equipo las revisa y decide si escalarlas.
 *
 * Fuentes de datos:
 *   - `GET /api/logistics/shipments?status=exception` (paginado)
 *   - Para cada incidencia, el último `ShipmentEvent` con la descripción
 *     que escribió el conductor (o el `routeStop.podNotes`).
 *   - `GET /api/logistics/incidents/client-reported` (últimos 30 días)
 */

import { incidentsApi, shipmentsApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Loader, Button, Input, Modal, useToast } from '@openfactu/ui';
import { AlertTriangle, CheckCircle2, MessageCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { ApiError } from '@/shared/http';
import type { ClientIncident, Shipment, ShipmentEvent } from '../domain/shipment';

interface Incident {
  shipment: Shipment;
  reason: string | null;
  reportedAt: string | null;
}

export const IncidentsTab: React.FC = () => {
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const toast = useToast();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [clientReported, setClientReported] = useState<ClientIncident[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    // Reportadas por clientes — en paralelo con la lista clásica.
    incidentsApi
      .listClientReported()
      .then((d) => setClientReported(Array.isArray(d) ? d : []))
      .catch(() => setClientReported([]));
    // Filtramos por ambos status (legacy + preparation) para no perder ninguno.
    const d = await shipmentsApi
      .list({ status: 'exception', preparationStatus: 'exception', pageSize: 100 })
      .catch(() => ({ rows: [] }));
    const rows: Shipment[] = Array.isArray(d) ? d : Array.isArray(d.rows) ? d.rows : [];
    // Para cada uno, pedimos el último event con descripción.
    const enriched = await Promise.all(
      rows.map(async (s) => {
        try {
          const events = await shipmentsApi.listEvents(s.id);
          const exc = events.find((e) => e.status === 'exception') || null;
          return {
            shipment: s,
            reason: exc?.description || null,
            reportedAt: exc?.createdAt || null,
          } as Incident;
        } catch {
          return { shipment: s, reason: null, reportedAt: null } as Incident;
        }
      }),
    );
    setIncidents(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  // Si un cliente reporta desde el chat con la pestaña abierta, refresca al vuelo.
  useRealtimeEvents({
    'shipment.incident': () => load(),
  });

  /** Escala una incidencia de cliente: el envío pasa a `exception` y entra
   *  en la lista clásica con sus acciones (resolver / devolución). */
  const escalate = async (ci: ClientIncident) => {
    try {
      await shipmentsApi.update(ci.shipmentId, {
        status: 'exception',
        reason: ci.description || 'Incidencia reportada por el cliente',
      });
      toast.success('Escalada — el envío queda en estado de incidencia');
      load();
    } catch {
      toast.error('No se pudo escalar la incidencia');
    }
  };

  // Estados de los modales — sustituyen a window.confirm/prompt para tener
  // feedback visual coherente con el resto de la app (y que funcione bien
  // en móvil, donde los diálogos nativos del navegador son horribles).
  const [resolveModal, setResolveModal] = useState<Incident | null>(null);
  const [returnModal, setReturnModal] = useState<Incident | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const confirmResolve = async () => {
    if (!resolveModal) return;
    setActionLoading(true);
    try {
      await shipmentsApi.update(resolveModal.shipment.id, { status: 'in_transit' });
      toast.success('Incidencia resuelta — envío en tránsito de nuevo');
      setResolveModal(null);
      load();
    } catch {
      toast.error('No se pudo resolver');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmReturn = async () => {
    if (!returnModal) return;
    setActionLoading(true);
    try {
      const d = await shipmentsApi.return(returnModal.shipment.id, {
        reason: returnReason.trim() || 'Convertida desde incidencia',
      });
      toast.success(
        d.receiptId
          ? 'Devolución creada. GoodsReceipt en borrador listo para postear.'
          : 'Devolución registrada.',
      );
      setReturnModal(null);
      setReturnReason('');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || 'No se pudo convertir en devolución');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-rose-500" size={18} />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {incidents.length === 0
              ? 'Sin incidencias activas'
              : `${incidents.length} incidencia(s) activa(s)`}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={load} className="flex items-center gap-2">
          <RefreshCw size={13} /> Refrescar
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : incidents.length === 0 ? (
        <Card bodyClassName="py-16 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Todo fluye sin incidencias
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Cuando un conductor reporte una incidencia desde su app, aparecerá aquí.
          </div>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {incidents.map((inc) => {
              const s = inc.shipment;
              return (
                <li
                  key={s.id}
                  className="border-b border-slate-50 dark:border-slate-800/50 last:border-0 px-4 py-3"
                >
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                      <AlertTriangle size={18} className="text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="error">Incidencia</Badge>
                        {s.trackingNumber && (
                          <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                            {s.trackingNumber}
                          </code>
                        )}
                        {s.driverName && (
                          <span className="text-[11px] text-slate-500">
                            Reportada por <b>{s.driverName}</b>
                            {s.vehiclePlate ? ` · ${s.vehiclePlate}` : ''}
                          </span>
                        )}
                        {inc.reportedAt && (
                          <span className="text-[11px] text-slate-400 ml-auto">
                            {new Date(inc.reportedAt).toLocaleString('es-ES')}
                          </span>
                        )}
                      </div>
                      {s.destinationAddress && (
                        <div className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                          {s.destinationAddress}
                          {s.recipientName && (
                            <span className="text-slate-500 text-xs"> · {s.recipientName}</span>
                          )}
                        </div>
                      )}
                      {inc.reason && (
                        <div className="mt-1 rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-800 dark:text-rose-200">
                          <b>Motivo:</b> {inc.reason}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2 flex-wrap justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        openTab(`/logistics/shipments/${s.id}`, {
                          title: `Envío ${s.trackingNumber || ''}`,
                        })
                      }
                      className="text-primary"
                    >
                      Ver detalle
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setReturnReason('');
                        setReturnModal(inc);
                      }}
                      className="flex items-center gap-1.5 !text-amber-700"
                    >
                      <RotateCcw size={13} /> Convertir en devolución
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setResolveModal(inc)}
                      className="flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={13} /> Marcar resuelta
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Reportadas por clientes — vía chat público de seguimiento. No cambian
          el estado del envío hasta que el equipo las escala. */}
      {clientReported.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <MessageCircle size={16} className="text-amber-500" />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Reportadas por clientes
            </span>
            <span className="text-[11px] text-slate-400">
              vía chat de seguimiento · últimos 30 días
            </span>
          </div>
          <Card bodyClassName="p-0">
            <ul>
              {clientReported.map((ci) => {
                const escalated =
                  ci.shipmentStatus === 'exception' || ci.preparationStatus === 'exception';
                return (
                  <li
                    key={ci.eventId}
                    className="border-b border-slate-50 dark:border-slate-800/50 last:border-0 px-4 py-3"
                  >
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="shrink-0 w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                        <MessageCircle size={18} className="text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="warning">Cliente</Badge>
                          {escalated && <Badge variant="error">Escalada</Badge>}
                          <span className="text-[11px] text-slate-400 ml-auto">
                            {new Date(ci.createdAt).toLocaleString('es-ES')}
                          </span>
                        </div>
                        {ci.destinationAddress && (
                          <div className="text-sm text-slate-700 dark:text-slate-200 mt-0.5 truncate">
                            {ci.destinationAddress}
                            {ci.recipientName && (
                              <span className="text-slate-500 text-xs"> · {ci.recipientName}</span>
                            )}
                          </div>
                        )}
                        {ci.description && (
                          <div className="mt-1 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200">
                            {ci.description}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2 flex-wrap justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          openTab(`/logistics/shipments/${ci.shipmentId}`, { title: 'Envío' })
                        }
                        className="text-primary"
                      >
                        Ver envío
                      </Button>
                      {!escalated && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => escalate(ci)}
                          className="flex items-center gap-1.5 !text-rose-700"
                        >
                          <AlertTriangle size={13} /> Escalar a incidencia
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      {/* Modal — Marcar resuelta */}
      <Modal
        isOpen={!!resolveModal}
        onClose={() => !actionLoading && setResolveModal(null)}
        title="Marcar incidencia como resuelta"
        subtitle={
          resolveModal
            ? `Envío ${resolveModal.shipment.trackingNumber || resolveModal.shipment.id.slice(0, 8)}`
            : ''
        }
        maxWidth="md"
      >
        <div className="space-y-3">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            El envío volverá al estado <b>En tránsito</b> para que el conductor pueda completar la
            entrega. La incidencia seguirá visible en el historial del envío.
          </div>
          {resolveModal?.reason && (
            <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              <b>Motivo original:</b> {resolveModal.reason}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="secondary"
              onClick={() => setResolveModal(null)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button onClick={confirmResolve} disabled={actionLoading}>
              <CheckCircle2 size={14} className="inline mr-1" />
              {actionLoading ? 'Resolviendo…' : 'Marcar resuelta'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal — Convertir en devolución */}
      <Modal
        isOpen={!!returnModal}
        onClose={() => !actionLoading && setReturnModal(null)}
        title="Convertir incidencia en devolución"
        subtitle={
          returnModal
            ? `Envío ${returnModal.shipment.trackingNumber || returnModal.shipment.id.slice(0, 8)}`
            : ''
        }
        maxWidth="md"
      >
        <div className="space-y-3">
          <div className="text-sm text-slate-700 dark:text-slate-200">
            Se marcará el envío como <b>devuelto</b> y se creará una entrada de stock (GoodsReceipt)
            en borrador sobre el almacén origen para que revises y postees el retorno de mercancía.
          </div>
          {returnModal?.reason && (
            <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              <b>Motivo original:</b> {returnModal.reason}
            </div>
          )}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Motivo de la devolución (opcional)
            </label>
            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              rows={3}
              placeholder="Resumen breve — p. ej. cliente rechazó, producto dañado…"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 py-2 text-slate-800 dark:text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              variant="secondary"
              onClick={() => {
                setReturnModal(null);
                setReturnReason('');
              }}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button onClick={confirmReturn} disabled={actionLoading}>
              <RotateCcw size={14} className="inline mr-1" />
              {actionLoading ? 'Creando…' : 'Convertir en devolución'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
