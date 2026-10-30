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
import { Card, Badge, Loader, Button, Textarea, Modal, useToast } from '@openfactu/ui';
import { AlertTriangle, CheckCircle2, MessageCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { formatDateTime } from '@/i18n/format';
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
  const { t } = useI18n();
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
      toast.success(t('logistics.incidents.escalated'));
      load();
    } catch {
      toast.error(t('logistics.incidents.escalateError'));
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
      toast.success(t('logistics.incidents.resolved'));
      setResolveModal(null);
      load();
    } catch {
      toast.error(t('logistics.incidents.resolveError'));
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
          ? t('logistics.incidents.returnCreated')
          : t('logistics.incidents.returnRegistered'),
      );
      setReturnModal(null);
      setReturnReason('');
      load();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(msg || t('logistics.incidents.returnError'));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-rose-500" size={18} />
          <span className="text-sm text-fg-body">
            {incidents.length === 0
              ? t('logistics.incidents.noneActive')
              : t('logistics.incidents.activeCount', { count: incidents.length })}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={load} className="flex items-center gap-2">
          <RefreshCw size={13} /> {t('logistics.incidents.refresh')}
        </Button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : incidents.length === 0 ? (
        <Card bodyClassName="py-16 text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" />
          <div className="text-sm font-bold text-fg-body">
            {t('logistics.incidents.emptyTitle')}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{t('logistics.incidents.emptyHint')}</div>
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {incidents.map((inc) => {
              const s = inc.shipment;
              return (
                <li key={s.id} className="border-b border-border-subtle last:border-0 px-4 py-3">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                      <AlertTriangle size={18} className="text-rose-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="error">{t('logistics.incidents.badge')}</Badge>
                        {s.trackingNumber && (
                          <code className="px-1.5 py-0.5 bg-bg-muted text-[11px] font-mono rounded">
                            {s.trackingNumber}
                          </code>
                        )}
                        {s.driverName && (
                          <span className="text-[11px] text-slate-500">
                            {t('logistics.incidents.reportedBy')} <b>{s.driverName}</b>
                            {s.vehiclePlate ? ` · ${s.vehiclePlate}` : ''}
                          </span>
                        )}
                        {inc.reportedAt && (
                          <span className="text-[11px] text-slate-400 ml-auto">
                            {formatDateTime(inc.reportedAt)}
                          </span>
                        )}
                      </div>
                      {s.destinationAddress && (
                        <div className="text-sm text-fg-body mt-0.5 truncate">
                          {s.destinationAddress}
                          {s.recipientName && (
                            <span className="text-slate-500 text-xs"> · {s.recipientName}</span>
                          )}
                        </div>
                      )}
                      {inc.reason && (
                        <div className="mt-1 rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-2.5 py-1.5 text-xs text-rose-800 dark:text-rose-200">
                          <b>{t('logistics.incidents.reason')}</b> {inc.reason}
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
                          title: t('logistics.incidents.shipmentTitle', {
                            code: s.trackingNumber || '',
                          }),
                        })
                      }
                      className="text-primary"
                    >
                      {t('logistics.incidents.viewDetail')}
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
                      <RotateCcw size={13} /> {t('logistics.incidents.convertToReturn')}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setResolveModal(inc)}
                      className="flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={13} /> {t('logistics.incidents.markResolved')}
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
            <span className="text-sm font-bold text-fg-body">
              {t('logistics.incidents.clientReported')}
            </span>
            <span className="text-[11px] text-slate-400">
              {t('logistics.incidents.clientReportedHint')}
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
                    className="border-b border-border-subtle last:border-0 px-4 py-3"
                  >
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className="shrink-0 w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                        <MessageCircle size={18} className="text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="warning">{t('logistics.incidents.customer')}</Badge>
                          {escalated && (
                            <Badge variant="error">{t('logistics.incidents.escalatedBadge')}</Badge>
                          )}
                          <span className="text-[11px] text-slate-400 ml-auto">
                            {formatDateTime(ci.createdAt)}
                          </span>
                        </div>
                        {ci.destinationAddress && (
                          <div className="text-sm text-fg-body mt-0.5 truncate">
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
                          openTab(`/logistics/shipments/${ci.shipmentId}`, {
                            title: t('logistics.incidents.shipment'),
                          })
                        }
                        className="text-primary"
                      >
                        {t('logistics.incidents.viewShipment')}
                      </Button>
                      {!escalated && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => escalate(ci)}
                          className="flex items-center gap-1.5 !text-rose-700"
                        >
                          <AlertTriangle size={13} /> {t('logistics.incidents.escalate')}
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
        title={t('logistics.incidents.resolveModal.title')}
        subtitle={
          resolveModal
            ? t('logistics.incidents.shipmentTitle', {
                code: resolveModal.shipment.trackingNumber || resolveModal.shipment.id.slice(0, 8),
              })
            : ''
        }
        maxWidth="md"
      >
        <div className="space-y-3">
          <div className="text-sm text-fg-body">
            {t('logistics.incidents.resolveModal.before')}{' '}
            <b>{t('logistics.incidents.resolveModal.status')}</b>{' '}
            {t('logistics.incidents.resolveModal.after')}
          </div>
          {resolveModal?.reason && (
            <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              <b>{t('logistics.incidents.originalReason')}</b> {resolveModal.reason}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
            <Button
              variant="secondary"
              onClick={() => setResolveModal(null)}
              disabled={actionLoading}
            >
              {t('logistics.incidents.cancel')}
            </Button>
            <Button onClick={confirmResolve} disabled={actionLoading}>
              <CheckCircle2 size={14} className="inline mr-1" />
              {actionLoading
                ? t('logistics.incidents.resolving')
                : t('logistics.incidents.markResolved')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal — Convertir en devolución */}
      <Modal
        isOpen={!!returnModal}
        onClose={() => !actionLoading && setReturnModal(null)}
        title={t('logistics.incidents.returnModal.title')}
        subtitle={
          returnModal
            ? t('logistics.incidents.shipmentTitle', {
                code: returnModal.shipment.trackingNumber || returnModal.shipment.id.slice(0, 8),
              })
            : ''
        }
        maxWidth="md"
      >
        <div className="space-y-3">
          <div className="text-sm text-fg-body">
            {t('logistics.incidents.returnModal.before')}{' '}
            <b>{t('logistics.incidents.returnModal.status')}</b>{' '}
            {t('logistics.incidents.returnModal.after')}
          </div>
          {returnModal?.reason && (
            <div className="rounded-md bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
              <b>{t('logistics.incidents.originalReason')}</b> {returnModal.reason}
            </div>
          )}
          <Textarea
            label={t('logistics.incidents.returnModal.reasonLabel')}
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            rows={3}
            placeholder={t('logistics.incidents.returnModal.reasonPlaceholder')}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
            <Button
              variant="secondary"
              onClick={() => {
                setReturnModal(null);
                setReturnReason('');
              }}
              disabled={actionLoading}
            >
              {t('logistics.incidents.cancel')}
            </Button>
            <Button onClick={confirmReturn} disabled={actionLoading}>
              <RotateCcw size={14} className="inline mr-1" />
              {actionLoading
                ? t('logistics.incidents.creating')
                : t('logistics.incidents.convertToReturn')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
