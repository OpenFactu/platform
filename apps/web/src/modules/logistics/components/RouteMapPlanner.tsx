import { shipmentsApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, List, Loader, MapPath, Marker } from '@openfactu/ui';
import { ArrowUp, ArrowDown, X, Zap } from 'lucide-react';
import type { UnroutedShipment } from '../domain/route';
import { boundsOfPoints, nearestNeighborOrder, type Coords } from '../domain/routePlanning';
import { useI18n } from '@/i18n/I18nContext';
import { LogisticsMap } from './maps/LogisticsMap';
import { NumberedPin } from './maps/MapPins';

interface Props {
  /** Cambia cuando el padre reordena/selecciona envíos externamente. */
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

const coordsOf = (s: UnroutedShipment): Coords => [
  s.destinationLat as number,
  s.destinationLng as number,
];

export const RouteMapPlanner: React.FC<Props> = ({ selectedIds, onSelectionChange }) => {
  const { t } = useI18n();
  const [shipments, setShipments] = useState<UnroutedShipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    shipmentsApi
      .listUnrouted()
      .then((d) => setShipments(Array.isArray(d) ? d : []))
      .catch(() => setShipments([]))
      .finally(() => setLoading(false));
  }, []);

  const byId = useMemo(() => new Map(shipments.map((s) => [s.id, s] as const)), [shipments]);
  const withCoords = useMemo(
    () => shipments.filter((s) => s.destinationLat != null && s.destinationLng != null),
    [shipments],
  );
  const bounds = useMemo(() => boundsOfPoints(withCoords.map(coordsOf)), [withCoords]);
  const selectedPoints = useMemo(
    () =>
      selectedIds
        .map((id) => byId.get(id))
        .filter((s): s is UnroutedShipment => !!s && s.destinationLat != null)
        .map(coordsOf),
    [selectedIds, byId],
  );

  const toggle = (id: string) =>
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  const move = (index: number, direction: -1 | 1) => {
    const next = [...selectedIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onSelectionChange(next);
  };
  const optimize = () =>
    onSelectionChange(nearestNeighborOrder(selectedPoints).map((i) => selectedIds[i]));

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <div className="md:col-span-3 h-[420px] rounded-lg overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <Loader />
          </div>
        ) : (
          <LogisticsMap bounds={bounds} className="h-full">
            {selectedPoints.length >= 2 && (
              <MapPath points={selectedPoints.map(([lat, lng]) => ({ lat, lng }))} dashed />
            )}
            {withCoords.map((s) => {
              const index = selectedIds.indexOf(s.id);
              const selected = index !== -1;
              return (
                <Marker
                  key={s.id}
                  lat={s.destinationLat as number}
                  lng={s.destinationLng as number}
                  label={s.code || s.destinationAddress || s.id}
                  onClick={() => toggle(s.id)}
                >
                  <NumberedPin
                    label={selected ? index + 1 : '+'}
                    tone={selected ? 'success' : 'muted'}
                  />
                </Marker>
              );
            })}
          </LogisticsMap>
        )}
      </div>

      <div className="md:col-span-2 flex flex-col gap-2 max-h-[420px]">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            {t('logistics.routePlanner.stops', { count: selectedIds.length })}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={optimize}
            disabled={selectedIds.length < 2}
            title={t('logistics.routePlanner.optimizeHint')}
          >
            <Zap size={11} /> {t('logistics.routePlanner.optimize')}
          </Button>
        </div>
        {selectedIds.length === 0 ? (
          <EmptyState className="flex-1" title={t('logistics.routePlanner.emptyHint')} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            <List
              variant="bordered"
              density="compact"
              items={selectedIds.map((id, index) => {
                const s = byId.get(id);
                return {
                  id,
                  icon: <NumberedPin label={index + 1} tone="success" onMap={false} />,
                  title: s?.code || s?.trackingNumber || id.slice(0, 8),
                  subtitle: s?.destinationAddress || '—',
                  actions: [
                    {
                      icon: <ArrowUp size={12} />,
                      label: t('logistics.routePlanner.moveUp'),
                      onClick: () => move(index, -1),
                      disabled: index === 0,
                    },
                    {
                      icon: <ArrowDown size={12} />,
                      label: t('logistics.routePlanner.moveDown'),
                      onClick: () => move(index, 1),
                      disabled: index === selectedIds.length - 1,
                    },
                    {
                      icon: <X size={12} />,
                      label: t('logistics.routePlanner.removeFromRoute'),
                      onClick: () => toggle(id),
                    },
                  ],
                };
              })}
            />
          </div>
        )}
        {shipments.length > withCoords.length && (
          <Alert tone="warning">
            {t('logistics.routePlanner.missingCoords', {
              count: shipments.length - withCoords.length,
            })}
          </Alert>
        )}
      </div>
    </div>
  );
};
