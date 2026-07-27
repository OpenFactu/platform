import { shipmentsApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Marker, Source, Layer } from 'react-map-gl/maplibre';
import { BaseMap } from './maps/BaseMap';
import { Button } from '@openfactu/ui';
import { ArrowUp, ArrowDown, X, Zap } from 'lucide-react';
import type { UnroutedShipment } from '../domain/route';

interface Props {
  token: string;
  tenantId: string;
  /** Cambia cuando el padre reordena/selecciona envíos externamente. */
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

function NumberedPin({ n, selected }: { n: number; selected: boolean }) {
  return (
    <div
      style={{
        background: selected ? '#10b981' : '#94a3b8',
        color: '#fff',
        width: 28,
        height: 28,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 900,
        fontSize: 12,
        border: '2px solid white',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        cursor: 'pointer',
      }}
    >
      {selected ? n : '+'}
    </div>
  );
}

const dist = (a: [number, number], b: [number, number]) => {
  // Haversine aproximado suficiente para orden relativo (no necesitamos km exactos).
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
};

/** Reordena `pts` minimizando distancia total, partiendo del primer punto. */
function nearestNeighbor(pts: [number, number][]): number[] {
  if (pts.length <= 1) return pts.map((_, i) => i);
  const order = [0];
  const used = new Set([0]);
  while (order.length < pts.length) {
    const last = pts[order[order.length - 1]];
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      if (used.has(i)) continue;
      const d = dist(last, pts[i]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    order.push(bestIdx);
    used.add(bestIdx);
  }
  return order;
}

export const RouteMapPlanner: React.FC<Props> = ({
  token,
  tenantId,
  selectedIds,
  onSelectionChange,
}) => {
  const [shipments, setShipments] = useState<UnroutedShipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const d = await shipmentsApi.listUnrouted();
        setShipments(Array.isArray(d) ? d : []);
      } catch {
        setShipments([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, tenantId]);

  const byId = useMemo(() => new Map(shipments.map((s) => [s.id, s] as const)), [shipments]);

  const withCoords = useMemo(
    () => shipments.filter((s) => s.destinationLat != null && s.destinationLng != null),
    [shipments],
  );

  const center = useMemo<[number, number]>(() => {
    if (withCoords.length === 0) return [40.4168, -3.7038]; // Madrid por defecto
    const lat =
      withCoords.reduce((a, s) => a + (s.destinationLat as number), 0) / withCoords.length;
    const lng =
      withCoords.reduce((a, s) => a + (s.destinationLng as number), 0) / withCoords.length;
    return [lat, lng];
  }, [withCoords]);

  const selectedPoints = useMemo<[number, number][]>(
    () =>
      selectedIds
        .map((id) => byId.get(id))
        .filter(
          (s): s is UnroutedShipment => !!s && s.destinationLat != null && s.destinationLng != null,
        )
        .map((s) => [s.destinationLat as number, s.destinationLng as number]),
    [selectedIds, byId],
  );

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...selectedIds];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onSelectionChange(next);
  };

  const optimize = () => {
    if (selectedPoints.length < 2) return;
    const order = nearestNeighbor(selectedPoints);
    onSelectionChange(order.map((i) => selectedIds[i]));
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <div className="md:col-span-3 h-[420px] rounded-lg overflow-hidden border border-border-default">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            Cargando envíos…
          </div>
        ) : (
          <BaseMap latitude={center[0]} longitude={center[1]} zoom={12}>
            {withCoords.map((s) => {
              const idx = selectedIds.indexOf(s.id);
              const selected = idx !== -1;
              return (
                <Marker
                  key={s.id}
                  longitude={s.destinationLng as number}
                  latitude={s.destinationLat as number}
                  anchor="center"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    toggle(s.id);
                  }}
                >
                  <NumberedPin n={selected ? idx + 1 : 0} selected={selected} />
                </Marker>
              );
            })}
            {selectedPoints.length >= 2 && (
              <Source
                id="route-planner-line"
                type="geojson"
                data={{
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    // maplibre espera [lng, lat]; selectedPoints es [lat, lng].
                    coordinates: selectedPoints.map(([lat, lng]) => [lng, lat]),
                  },
                  properties: {},
                }}
              >
                <Layer
                  id="route-planner-line-layer"
                  type="line"
                  paint={{
                    'line-color': '#10b981',
                    'line-width': 3,
                    'line-dasharray': [2, 2],
                  }}
                />
              </Source>
            )}
          </BaseMap>
        )}
      </div>

      <div className="md:col-span-2 flex flex-col gap-2 max-h-[420px]">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Paradas ({selectedIds.length})
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={optimize}
            disabled={selectedIds.length < 2}
            title="Reordena por proximidad (vecino más cercano)"
          >
            <Zap size={11} /> Optimizar
          </Button>
        </div>
        {selectedIds.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-[11px] text-slate-400 px-2 rounded-lg border-2 border-dashed border-border-default">
            Haz click en los pines del mapa para añadirlos a la ruta en el orden que quieras.
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto space-y-1">
            {selectedIds.map((id, i) => {
              const s = byId.get(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-bg-muted border border-border-default text-xs"
                >
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">
                      {s?.trackingNumber || id.slice(0, 8)}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {s?.destinationAddress || '—'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    title="Subir"
                  >
                    <ArrowUp size={12} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => move(i, 1)}
                    disabled={i === selectedIds.length - 1}
                    title="Bajar"
                  >
                    <ArrowDown size={12} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle(id)}
                    title="Quitar de la ruta"
                  >
                    <X size={12} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {shipments.length > withCoords.length && (
          <div className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1 border border-amber-200">
            {shipments.length - withCoords.length} envío(s) no aparecen porque no tienen
            coordenadas. Edita el envío y coloca el pin en el mapa.
          </div>
        )}
      </div>
    </div>
  );
};
