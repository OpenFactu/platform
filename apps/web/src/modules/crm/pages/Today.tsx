import React, { useMemo, useState } from 'react';
import { Card, PageHeader } from '@openfactu/ui';
import { Sun } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isStale } from '../domain/crm';
import { useCrmSettings, useOpportunities } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { ActivityList } from '../components/ActivityList';
import { OpportunityMiniList } from '../components/OpportunityMiniList';

const DAY = 86_400_000;

/**
 * Lo del día del comercial: sus actividades pendientes (las vencidas primero),
 * sus oportunidades que cierran pronto y las que llevan tiempo paradas.
 */
export const Today: React.FC = () => {
  const { user } = useAuth();
  const oppPerm = useCrmPermissions('/crm/opportunities');
  const { opportunities } = useOpportunities();
  const { settings } = useCrmSettings();
  // La hora de referencia se fija al abrir la pantalla.
  const [now] = useState(() => Date.now());

  const mine = useMemo(
    () =>
      opportunities.filter((o) => o.ownerUserId === user?.id && (o.stageKind ?? 'open') === 'open'),
    [opportunities, user?.id],
  );
  const closingSoon = useMemo(() => {
    const limit = now + 7 * DAY;
    return mine
      .filter((o) => o.expectedCloseDate && new Date(o.expectedCloseDate).getTime() <= limit)
      .sort((a, b) => (a.expectedCloseDate! < b.expectedCloseDate! ? -1 : 1));
  }, [mine, now]);
  const stale = useMemo(
    () => mine.filter((o) => isStale(o, settings.staleDays)),
    [mine, settings.staleDays],
  );

  return (
    <div className="p-4 w-full space-y-4">
      <PageHeader
        title="Hoy"
        subtitle="Tus actividades pendientes y las oportunidades que piden atención"
        icon={<Sun size={18} />}
        size="sm"
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Card title="Mis actividades pendientes" subtitle="Las vencidas salen en rojo.">
          <ActivityList filter={{ status: 'pending', ownerUserId: user?.id }} askPartner compact />
        </Card>
        {oppPerm.canRead && (
          <div className="space-y-4">
            <Card title="Cierran en los próximos 7 días">
              <OpportunityMiniList
                items={closingSoon}
                empty="Nada cierra esta semana"
                dateOf={(o) => o.expectedCloseDate}
              />
            </Card>
            <Card title="Paradas" subtitle={`Sin actividad en ${settings.staleDays} días o más.`}>
              <OpportunityMiniList
                items={stale}
                empty="Ninguna parada"
                dateOf={(o) => o.lastActivityAt ?? o.updatedAt}
              />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default Today;
