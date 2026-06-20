/**
 * Pestaña de Incidencias — lista todos los envíos en estado `exception` con
 * el motivo reportado por el conductor, y deja resolverlas o convertirlas
 * en devolución.
 *
 * Fuentes de datos:
 *   - `GET /api/logistics/shipments?status=exception` (paginado)
 *   - Para cada incidencia, el último `ShipmentEvent` con la descripción
 *     que escribió el conductor (o el `routeStop.podNotes`).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Loader, Button, Input, Modal, useToast } from '@openfactu/ui';
import { AlertTriangle, CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTabs } from '../../context/TabsContext';

interface Shipment {
  id: string;
  trackingNumber: string | null;
  status: string;
  preparationStatus: string | null;
  driverName: string | null;
  vehiclePlate: string | null;
  destinationAddress: string | null;
  recipientName: string | null;
  updatedAt: string;
}

interface ShipmentEvent {
  kind: string;
  status: string | null;
  description: string | null;
  createdAt: string;
}

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
  const [loading, setLoading] = useState(true);

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-tenant-id': user?.tenantId || '',
    }),
    [token, user?.tenantId],
  );

  const load = async () => {
    setLoading(true);
    // Filtramos por ambos status (legacy + preparation) para no perder ninguno.
    const r = await fetch(
      `/api/logistics/shipments?status=exception&preparationStatus=exception&pageSize=100`,
      { headers },
    );
    const d = r.ok ? await r.json() : { rows: [] };
    const rows: Shipment[] = Array.isArray(d.rows) ? d.rows : Array.isArray(d) ? d : [];
    // Para cada uno, pedimos el último event con descripción.
    const enriched = await Promise.all(
      rows.map(async (s) => {
        try {
          const er = await fetch(`/api/logistics/shipments/${s.id}/events`, { headers });
          if (!er.ok) return { shipment: s, reason: null, reportedAt: null } as Incident;
          const events: ShipmentEvent[] = await er.json();
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
    const r = await fetch(`/api/logistics/shipments/${resolveModal.shipment.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'in_transit' }),
    });
    setActionLoading(false);
    if (r.ok) {
      toast.success('Incidencia resuelta — envío en tránsito de nuevo');
      setResolveModal(null);
      load();
    } else {
      toast.error('No se pudo resolver');
    }
  };

  const confirmReturn = async () => {
    if (!returnModal) return;
    setActionLoading(true);
    const r = await fetch(`/api/logistics/shipments/${returnModal.shipment.id}/return`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: returnReason.trim() || 'Convertida desde incidencia',
      }),
    });
    setActionLoading(false);
    if (r.ok) {
      const d = await r.json();
      toast.success(
        d.receiptId
          ? 'Devolución creada. GoodsReceipt en borrador listo para postear.'
          : 'Devolución registrada.',
      );
      setReturnModal(null);
      setReturnReason('');
      load();
    } else {
      const d = await r.json().catch(() => ({}));
      toast.error(d.error || 'No se pudo convertir en devolución');
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
        <Button
          variant="secondary"
          size="sm"
          onClick={load}
          className="flex items-center gap-2"
        >
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
                      onClick={() => openTab(`/logistics/shipments/${s.id}`, { title: `Envío ${s.trackingNumber || ''}` })}
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
            El envío volverá al estado <b>En tránsito</b> para que el conductor
            pueda completar la entrega. La incidencia seguirá visible en el
            historial del envío.
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
            Se marcará el envío como <b>devuelto</b> y se creará una entrada
            de stock (GoodsReceipt) en borrador sobre el almacén origen para
            que revises y postees el retorno de mercancía.
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
