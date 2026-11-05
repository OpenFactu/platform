import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { logisticsApi } from '../api';
import type {
  DeliveryFlow,
  Handover,
  MapSettings,
  ReasonKind,
  StopReason,
} from '../domain/deliveryFlow';
import { mapProblem } from '../domain/mapProviders';
import { OTHER_PROBLEM } from '../domain/stopProblems';
import { invalidateMapSettings } from './useMapSettings';

/** La configuración de cómo reparte la empresa, con sus cambios sin guardar. */
export function useDeliveryFlow() {
  const { t } = useI18n();
  const toast = useToast();
  const [saved, setSaved] = useState<DeliveryFlow | null>(null);
  const [draft, setDraft] = useState<DeliveryFlow | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    logisticsApi
      .deliveryFlow()
      .then((flow) => {
        setSaved(flow);
        setDraft(flow);
      })
      .catch(() => setFailed(true));
  }, []);

  const set = useCallback(
    (patch: Partial<DeliveryFlow>) =>
      setDraft((current) => (current ? { ...current, ...patch } : current)),
    [],
  );
  const setMap = useCallback(
    (patch: Partial<MapSettings>) =>
      setDraft((current) =>
        current ? { ...current, map: { ...current.map, ...patch } } : current,
      ),
    [],
  );

  const toggleHandover = (option: Handover, on: boolean) => {
    if (!draft) return;
    const handover = on
      ? [...draft.handover, option]
      : draft.handover.filter((other) => other !== option);
    if (handover.length > 0) set({ handover });
  };

  const setReason = (id: string, patch: Partial<StopReason>) => {
    if (!draft) return;
    set({
      reasons: draft.reasons.map((reason) => (reason.id === id ? { ...reason, ...patch } : reason)),
    });
  };
  /** Los motivos propios van antes de "otro motivo", que siempre es el último. */
  const addReason = (label: string, kind: ReasonKind) => {
    if (!draft) return;
    const reason: StopReason = { id: `own-${crypto.randomUUID()}`, kind, enabled: true, label };
    const others = draft.reasons.filter((r) => r.id !== OTHER_PROBLEM);
    const last = draft.reasons.filter((r) => r.id === OTHER_PROBLEM);
    set({ reasons: [...others, reason, ...last] });
  };
  const removeReason = (id: string) => {
    if (!draft) return;
    set({ reasons: draft.reasons.filter((reason) => reason.id !== id) });
  };

  const mapError = draft ? mapProblem(draft.map) : null;
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  const save = async () => {
    if (!draft || mapError) return;
    setSaving(true);
    try {
      const next = await logisticsApi.saveDeliveryFlow(draft);
      setSaved(next);
      setDraft(next);
      invalidateMapSettings();
      toast.success(t('logistics.flow.saved'));
    } catch (err) {
      const message = err instanceof ApiError ? (err.body as any)?.error : undefined;
      toast.error(message || t('logistics.flow.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return {
    draft,
    failed,
    saving,
    dirty,
    mapError,
    set,
    setMap,
    toggleHandover,
    setReason,
    addReason,
    removeReason,
    save,
  };
}
