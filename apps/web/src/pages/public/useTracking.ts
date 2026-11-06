import type { MapSettings } from '@/modules/logistics/domain/deliveryFlow';
import { useCallback, useEffect, useState } from 'react';
import { applyTheme, getThemePreset } from '@openfactu/ui';
import { apiClient } from '@/shared/http';

export interface TrackEvent {
  kind: string;
  status: string | null;
  description: string | null;
  createdAt: string;
}

export interface TrackPayload {
  code: string | null;
  status: string;
  /** 'delivery' (entrega) o 'pickup_return' (pasamos a recoger un paquete). */
  kind?: string;
  destination: { address: string | null };
  lastPosition: { lat: number; lng: number; reportedAt: string } | null;
  map?: Partial<MapSettings>;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  events: TrackEvent[];
  updatedAt: string;
  chatEnabled?: boolean;
  branding?: {
    appName?: string;
    logoUrl?: string | null;
    colorPrimary?: string;
    colorAccent?: string;
    themeMode?: 'light' | 'dark';
    themePreset?: string | null;
  };
}

const REFRESH_MS = 30_000;

/** Sin sesión no hay tema cargado: se aplica el de la empresa que manda el servidor. */
function applyCompanyTheme(branding: TrackPayload['branding']) {
  if (!branding) return;
  const preset = branding.themePreset ? getThemePreset(branding.themePreset) : undefined;
  applyTheme(
    preset
      ? preset.theme
      : {
          mode: branding.themeMode,
          colors: { primary: branding.colorPrimary, accent: branding.colorAccent },
        },
  );
}

/** Lee el seguimiento y lo refresca solo cada medio minuto. */
export function useTracking(token: string | undefined) {
  const [data, setData] = useState<TrackPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!token) return;
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const payload = await apiClient.get<TrackPayload>(`/api/logistics/track/${token}`, {
          auth: false,
        });
        setData(payload);
        setFailed(false);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const branding = data?.branding;
  useEffect(() => {
    applyCompanyTheme(branding);
  }, [branding?.themePreset, branding?.colorPrimary, branding?.colorAccent, branding?.themeMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, refreshing, failed, reload: () => load(true) };
}
