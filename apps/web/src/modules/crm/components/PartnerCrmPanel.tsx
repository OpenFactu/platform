import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@openfactu/ui';
import { Plus } from 'lucide-react';
import { usePipeline } from '../hooks/usePipeline';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { ActivityList } from './ActivityList';
import { ContactsTable } from './ContactsTable';
import { OpportunityMiniList } from './OpportunityMiniList';
import { PartnerSummaryKpis } from './PartnerSummaryKpis';
import { PartnerTimeline } from './PartnerTimeline';

/**
 * Lo comercial de un interlocutor, para su ficha: contactos, oportunidades y
 * actividad. Cada bloque respeta su propio permiso del CRM.
 */
export const PartnerCrmPanel: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const contactsPerm = useCrmPermissions('/crm/contacts');
  const oppPerm = useCrmPermissions('/crm/opportunities');
  const pipeline = usePipeline(partnerId);
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PartnerSummaryKpis partnerId={partnerId} />
      {contactsPerm.canRead && <ContactsTable partnerId={partnerId} />}

      {oppPerm.canRead && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">
              Oportunidades
            </h3>
            {oppPerm.canWrite && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => navigate(`/crm/opportunities/new?partnerId=${partnerId}`)}
              >
                <Plus size={14} /> Nueva oportunidad
              </Button>
            )}
          </div>
          <OpportunityMiniList
            items={pipeline.opportunities}
            empty="Sin oportunidades"
            date={{ header: 'Cierre previsto', of: (o) => o.closedAt ?? o.expectedCloseDate }}
            hideClient
          />
        </div>
      )}

      <ActivityList
        title="Pendiente"
        filter={{ partnerId, status: 'pending' }}
        defaults={{ partnerId }}
        compact
      />
      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-fg-muted">Historial</h3>
        <PartnerTimeline partnerId={partnerId} />
      </div>
    </div>
  );
};
