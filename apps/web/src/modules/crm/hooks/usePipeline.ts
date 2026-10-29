import { useMemo, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { opportunitiesApi } from '../api';
import { groupByStage, weightedAmount, type Opportunity } from '../domain/crm';
import { useOpportunities, useStages } from './useCrmData';

/**
 * Estado del embudo: oportunidades agrupadas por etapa, totales y el cambio de
 * etapa (optimista: la tarjeta se mueve al soltarla y vuelve si el servidor falla).
 *
 * Llevar una oportunidad a una etapa «perdida» no se aplica enseguida: queda en
 * `pendingLost` hasta que se confirme el motivo (`confirmLost`).
 */
export function usePipeline(partnerId?: string) {
  const toast = useToast();
  const { stages, refresh: refreshStages } = useStages();
  const { opportunities, setOpportunities, loading, error, refresh } = useOpportunities(partnerId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<{ opp: Opportunity; stageId: string } | null>(
    null,
  );

  // Lo que mueven otros usuarios (o los hooks del servidor) aparece sin recargar.
  useRealtimeEvents({
    'crm.opportunity.created': () => refresh(),
    'crm.opportunity.stageChanged': () => refresh(),
  });

  const columns = useMemo(() => groupByStage(stages, opportunities), [stages, opportunities]);

  const summary = useMemo(() => {
    const open = opportunities.filter((o) => (o.stageKind ?? 'open') === 'open');
    return {
      openCount: open.length,
      openAmount: open.reduce((sum, o) => sum + (Number(o.amount) || 0), 0),
      weighted: open.reduce((sum, o) => sum + weightedAmount(o), 0),
    };
  }, [opportunities]);

  const applyMove = async (opp: Opportunity, stageId: string, lostReason?: string) => {
    const stage = stages.find((s) => s.id === stageId);
    const previous = opportunities;
    setOpportunities(
      previous.map((o) =>
        o.id === opp.id
          ? {
              ...o,
              stageId,
              stageName: stage?.name,
              stageKind: stage?.kind,
              stageProbability: stage?.probability,
              lostReason: lostReason ?? o.lostReason,
            }
          : o,
      ),
    );
    try {
      await opportunitiesApi.update(opp.id, lostReason ? { stageId, lostReason } : { stageId });
      refresh();
    } catch (err) {
      setOpportunities(previous);
      toast.error(err instanceof Error ? err.message : 'No se pudo mover la oportunidad');
    }
  };

  const moveTo = (opp: Opportunity, stageId: string) => {
    if (opp.stageId === stageId) return;
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.kind === 'lost') setPendingLost({ opp, stageId });
    else applyMove(opp, stageId);
  };

  const dropOn = (stageId: string) => {
    const opp = opportunities.find((o) => o.id === dragId);
    setDragId(null);
    if (opp) moveTo(opp, stageId);
  };

  return {
    stages,
    opportunities,
    columns,
    summary,
    loading,
    error,
    refresh: () => {
      refresh();
      refreshStages();
    },
    moveTo,
    pendingLost,
    confirmLost: (reason: string) => {
      if (pendingLost) applyMove(pendingLost.opp, pendingLost.stageId, reason);
      setPendingLost(null);
    },
    cancelLost: () => setPendingLost(null),
    drag: { dragId, start: setDragId, end: () => setDragId(null), dropOn },
  };
}
