/**
 * Preparación — gestor de shipments en estados `picking|packed|ready|receiving|received`.
 * Permite abrir el panel de tareas, empaquetar, marcar listo y asignar a una ruta.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge, Loader, Modal, useToast } from '@openfactu/ui';
import {
  Box,
  Package as PackageIcon,
  Send,
  CheckCircle2,
  ChevronRight,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PickingTasksPanel } from './PickingTasksPanel';
import { RoutePicker } from '../../components/logistics/RoutePicker';

interface Shipment {
  id: string;
  preparationStatus: string;
  status: string;
  sourceDocType: string | null;
  sourceDocId: string | null;
  destinationAddress: string | null;
  createdAt: string;
}

interface Route {
  id: string;
  code: string;
  name: string;
  plannedDate: string;
  status: string;
}

const PREP_BADGE: Record<string, any> = {
  draft: 'neutral',
  picking: 'info',
  packed: 'info',
  ready: 'success',
  dispatched: 'success',
  in_transit: 'info',
  delivered: 'success',
  receiving: 'info',
  received: 'success',
  cancelled: 'danger',
  exception: 'danger',
};

const PREP_LABEL: Record<string, string> = {
  draft: 'Borrador',
  picking: 'Preparando',
  packed: 'Empaquetado',
  ready: 'Listo',
  dispatched: 'Despachado',
  in_transit: 'En tránsito',
  delivered: 'Entregado',
  receiving: 'Recepcionando',
  received: 'Recibido',
  cancelled: 'Cancelado',
  exception: 'Incidencia',
};

export const PreparationTab: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stagingAreas, setStagingAreas] = useState<{ id: string; code: string; name: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Shipment | null>(null);
  const [showDispatch, setShowDispatch] = useState<Shipment | null>(null);
  const [dispatchRouteId, setDispatchRouteId] = useState('');
  const [showStaging, setShowStaging] = useState<Shipment | null>(null);
  const [stagingAreaId, setStagingAreaId] = useState('');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    setLoading(true);
    const [sh, rt, st] = await Promise.all([
      fetch('/api/logistics/shipments', { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/logistics/routes', { headers }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/logistics/staging-areas', { headers }).then((r) => (r.ok ? r.json() : [])),
    ]);
    setShipments(Array.isArray(sh) ? sh : []);
    setRoutes(Array.isArray(rt) ? rt : []);
    setStagingAreas(Array.isArray(st) ? st : []);
    setLoading(false);
  };
  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const activeShipments = useMemo(
    () =>
      shipments.filter((s) =>
        ['picking', 'packed', 'ready', 'receiving'].includes(s.preparationStatus),
      ),
    [shipments],
  );

  const act = async (url: string, body?: any) => {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return false;
    }
    return true;
  };

  const markReady = async (sh: Shipment) => {
    if (await act(`/api/logistics/shipments/${sh.id}/ready`)) {
      toast.success('Marcado como listo');
      load();
    }
  };

  const receive = async (sh: Shipment) => {
    if (await act(`/api/logistics/shipments/${sh.id}/receive`)) {
      toast.success('Recepción confirmada');
      load();
    }
  };

  const dispatch = async () => {
    if (!showDispatch) return;
    if (
      await act(`/api/logistics/shipments/${showDispatch.id}/dispatch`, {
        routeId: dispatchRouteId || null,
      })
    ) {
      toast.success('Despachado');
      setShowDispatch(null);
      setDispatchRouteId('');
      load();
    }
  };

  const sendToStaging = async () => {
    if (!showStaging || !stagingAreaId) return;
    const res = await fetch(`/api/logistics/shipments/${showStaging.id}/to-staging`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ stagingAreaId }),
    });
    const d = await res.json();
    if (!res.ok) {
      toast.error(d.error || 'Error');
      return;
    }
    const area = stagingAreas.find((a) => a.id === stagingAreaId);
    toast.success(
      `Movido a ${area?.name || 'acopio'} · ${d.packagesCreated > 0 ? 'paquete creado' : `${d.packagesAffected} paquete(s)`}`,
    );
    setShowStaging(null);
    setStagingAreaId('');
    load();
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader />
        </div>
      ) : activeShipments.length === 0 ? (
        <Card bodyClassName="py-10 text-center text-sm text-slate-500">
          Sin envíos en preparación. Desde un albarán de venta o compra pulsa <b>Preparar</b> para
          empezar.
        </Card>
      ) : (
        <Card bodyClassName="p-0">
          <ul>
            {activeShipments.map((sh) => (
              <li
                key={sh.id}
                className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 px-4 py-2.5 border-b border-slate-50 dark:border-slate-800/50 last:border-0"
              >
                <div className="flex items-start gap-2 md:flex-1 md:min-w-0">
                  <Badge variant={PREP_BADGE[sh.preparationStatus] || 'neutral'}>
                    {PREP_LABEL[sh.preparationStatus] || sh.preparationStatus}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                        {sh.sourceDocType === 'SDN'
                          ? 'Venta'
                          : sh.sourceDocType === 'PDN'
                            ? 'Compra'
                            : 'Envío'}
                      </span>
                      <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[11px] font-mono rounded">
                        {sh.id.slice(0, 8)}
                      </code>
                      {sh.destinationAddress && (
                        <span className="text-[11px] text-slate-500 truncate max-w-[60vw] md:max-w-sm">
                          → {sh.destinationAddress}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:gap-2 md:flex-nowrap md:shrink-0">
                  <Button
                    variant="secondary"
                    onClick={() => setSelected(sh)}
                    className="!px-2 !py-1 flex items-center gap-1"
                  >
                    <Box size={13} /> Tareas
                    <ChevronRight size={13} />
                  </Button>

                  {(sh.preparationStatus === 'packed' || sh.preparationStatus === 'ready') && (
                    <Button
                      variant="secondary"
                      onClick={() => setShowStaging(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                      title="Mover a un acopio"
                    >
                      <Warehouse size={13} /> A acopio
                    </Button>
                  )}
                  {sh.preparationStatus === 'packed' && (
                    <Button
                      onClick={() => markReady(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                    >
                      <PackageIcon size={13} /> Listo
                    </Button>
                  )}
                  {sh.preparationStatus === 'ready' && (
                    <Button
                      onClick={() => setShowDispatch(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                    >
                      <Send size={13} /> Despachar
                    </Button>
                  )}
                  {sh.preparationStatus === 'receiving' && (
                    <Button
                      onClick={() => receive(sh)}
                      className="!px-2 !py-1 flex items-center gap-1"
                    >
                      <CheckCircle2 size={13} /> Recibir
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal
        isOpen={!!selected}
        onClose={() => {
          setSelected(null);
          load();
        }}
        title="Tareas de preparación"
        subtitle={
          selected
            ? `${selected.sourceDocType || 'Envío'} · ${selected.preparationStatus}`
            : undefined
        }
        maxWidth="lg"
      >
        {selected && (
          <div className="pt-4">
            <PickingTasksPanel
              shipmentId={selected.id}
              onAllDone={() => {
                toast.success('Todas las tareas completadas — el envío pasa a packed');
                load();
              }}
            />
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!showStaging}
        onClose={() => setShowStaging(null)}
        title="Mover envío a un acopio"
        subtitle="Si el envío ya tiene paquetes, se moverán todos. Si no, se crea un paquete nuevo con las tareas completadas."
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Acopio destino
            </label>
            <select
              value={stagingAreaId}
              onChange={(e) => setStagingAreaId(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3"
            >
              <option value="">— seleccionar —</option>
              {stagingAreas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
            {stagingAreas.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                No hay acopios. Crea uno primero en Logística → Acopios.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowStaging(null)}>
              Cancelar
            </Button>
            <Button onClick={sendToStaging} disabled={!stagingAreaId}>
              Mover a acopio
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!showDispatch}
        onClose={() => setShowDispatch(null)}
        title="Despachar envío"
        subtitle="Se asignará a la ruta elegida como una parada nueva."
        maxWidth="md"
      >
        <div className="space-y-3 pt-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Ruta
            </label>
            <RoutePicker
              value={dispatchRouteId}
              onChange={setDispatchRouteId}
              routes={routes}
              filterStatuses={['planned', 'active']}
              allowEmpty
              placeholder="— sin asignar (solo marcar despachado) —"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" onClick={() => setShowDispatch(null)}>
              Cancelar
            </Button>
            <Button onClick={dispatch}>Despachar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
