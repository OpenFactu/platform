import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { shipmentsApi } from '../api';
import { actionsFor, stateOfShipment } from '../domain/shipmentStatus';
import type { ShipmentDetailData, ShipmentPosition } from '../domain/shipment';

/** La ficha de un envío: sus datos, su recorrido y lo que se puede hacer con él. */
export function useShipmentDetail(id: string | undefined) {
  const { t } = useI18n();
  const toast = useToast();
  const [detail, setDetail] = useState<ShipmentDetailData | null>(null);
  const [positions, setPositions] = useState<ShipmentPosition[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [data, track] = await Promise.all([
        shipmentsApi.getDetail(id),
        shipmentsApi.listPositions(id),
      ]);
      setDetail(data);
      setPositions(Array.isArray(track) ? track : []);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useRealtimeEvents({
    'shipment.position': (payload: any) => {
      if (payload?.shipmentId !== id) return;
      const reportedAt = new Date(payload.at).toISOString();
      setPositions((prev) => [
        { id: crypto.randomUUID(), shipmentId: id!, lat: payload.lat, lng: payload.lng, reportedAt },
        ...prev,
      ]);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              shipment: {
                ...prev.shipment,
                lastLat: payload.lat,
                lastLng: payload.lng,
                lastLocationAt: reportedAt,
              },
            }
          : prev,
      );
    },
    'shipment.updated': (payload: any) => {
      if (payload?.id === id) load();
    },
  });

  /** Corre una acción, recarga y avisa. Devuelve si ha ido bien. */
  const run = useCallback(
    async (work: () => Promise<unknown>, success?: string): Promise<boolean> => {
      try {
        await work();
        if (success) toast.success(success);
        await load();
        return true;
      } catch (err) {
        const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
        toast.error(message || t('logistics.common.error'));
        return false;
      }
    },
    [load, t, toast],
  );

  const shipment = detail?.shipment ?? null;
  const state = shipment ? stateOfShipment(shipment) : 'pending';
  const direction = (shipment?.direction as string) || 'out';
  const actions = useMemo(() => actionsFor(state, direction), [state, direction]);
  const track = useMemo(
    () =>
      [...positions]
        .sort((a, b) => new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime())
        .map((p) => ({ lat: p.lat, lng: p.lng })),
    [positions],
  );

  return { detail, shipment, state, direction, actions, track, loading, load, run };
}
