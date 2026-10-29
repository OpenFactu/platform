import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { partnersApi } from '@/modules/partners/api';
import type { Partner } from '@/modules/partners/domain/partner';
import {
  activitiesApi,
  contactsApi,
  crmSettingsApi,
  membersApi,
  opportunitiesApi,
  stagesApi,
} from '../api';
import type { ActivityFilter, OpportunityScope } from '../api';
import type {
  Activity,
  Contact,
  CrmSettings,
  Member,
  Opportunity,
  OpportunityStage,
} from '../domain/crm';

/**
 * Carga genérica con recarga manual. `key` resume los parámetros de la
 * petición: cuando cambia se vuelve a pedir. Solo pide con empresa activa.
 */
function useLoad<T>(load: () => Promise<T>, initial: T, key: string) {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${tenantId}|${key}|${tick}`;

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    load()
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Error al cargar');
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
    // `load` cambia en cada render; lo que decide si hay que volver a pedir es `requestKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, setData, loading: loadedKey !== requestKey, error, refresh };
}

export function useStages() {
  const { data, loading, error, refresh } = useLoad<OpportunityStage[]>(
    () => stagesApi.list(),
    [],
    '',
  );
  return { stages: data, loading, error, refresh };
}

export function useOpportunities(partnerId?: string, scope?: OpportunityScope) {
  const { data, setData, loading, error, refresh } = useLoad<Opportunity[]>(
    () => opportunitiesApi.list({ partnerId, scope }),
    [],
    `${partnerId ?? ''}|${scope ?? ''}`,
  );
  return { opportunities: data, setOpportunities: setData, loading, error, refresh };
}

export function useContacts(partnerId?: string) {
  const { data, loading, error, refresh } = useLoad<Contact[]>(
    () => contactsApi.list({ partnerId }),
    [],
    partnerId ?? '',
  );
  return { contacts: data, loading, error, refresh };
}

export function useActivities(filter: ActivityFilter) {
  const { partnerId, opportunityId, contactId, status, ownerUserId } = filter;
  const { data, loading, error, refresh } = useLoad<Activity[]>(
    () => activitiesApi.list({ partnerId, opportunityId, contactId, status, ownerUserId }),
    [],
    JSON.stringify([partnerId, opportunityId, contactId, status, ownerUserId]),
  );
  return { activities: data, loading, error, refresh };
}

/**
 * Interlocutores para los selectores. Se pide al montar, y los formularios se
 * montan al abrirse: así un cliente creado mientras tanto (aquí o en
 * Interlocutores) ya sale. Sin permiso sobre `/partners` llega vacía.
 */
export function usePartnerOptions() {
  const { data, loading, refresh } = useLoad<Partner[]>(
    () => partnersApi.list().catch(() => []),
    [],
    '',
  );
  const options = useMemo(
    () =>
      data.map((p) => ({
        value: p.id,
        label: p.name,
        secondaryLabel: p.code ?? undefined,
      })),
    [data],
  );
  return { options, loading, refresh };
}

const SETTINGS_FALLBACK: CrmSettings = {
  lostReasons: [],
  sources: [],
  sourceRequired: false,
  defaultOwnerUserId: '',
  staleDays: 14,
  dormantEnabled: false,
  dormantDays: 90,
  boardClosedDays: 30,
};

export function useCrmSettings() {
  const { data, setData, loading, refresh } = useLoad<CrmSettings>(
    () => crmSettingsApi.get(),
    SETTINGS_FALLBACK,
    '',
  );
  return { settings: data, setSettings: setData, loading, refresh };
}

/** Miembros de la empresa, para elegir y mostrar responsables. */
export function useMembers() {
  const { data } = useLoad<Member[]>(() => membersApi.list().catch(() => []), [], '');
  const byId = useMemo(() => new Map(data.map((m) => [m.id, m])), [data]);
  return { members: data, byId };
}
