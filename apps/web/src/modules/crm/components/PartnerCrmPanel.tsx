import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, EmptyState } from '@openfactu/ui';
import { Plus, Target } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { STAGE_KIND_VARIANT } from '../domain/crm';
import { usePipeline } from '../hooks/usePipeline';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { ActivityList } from './ActivityList';
import { ContactsTable } from './ContactsTable';
import { PartnerSummaryKpis } from './PartnerSummaryKpis';
import { PartnerTimeline } from './PartnerTimeline';

/**
 * Lo comercial de un interlocutor, para su ficha: contactos, oportunidades y
 * actividad. Cada bloque respeta su propio permiso del CRM.
 */
export const PartnerCrmPanel: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const fmt = useFormat();
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
          {pipeline.opportunities.length === 0 ? (
            <EmptyState variant="compact" icon={<Target size={18} />} title="Sin oportunidades" />
          ) : (
            <ul className="divide-y divide-border-subtle rounded-xs border border-border-default bg-bg-card">
              {pipeline.opportunities.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/crm/opportunities/${o.id}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover"
                  >
                    <span className="flex-1 min-w-0 text-sm text-fg-default truncate">
                      {o.title}
                    </span>
                    <Badge variant={STAGE_KIND_VARIANT[o.stageKind ?? 'open']}>{o.stageName}</Badge>
                    <span className="text-sm tabular-nums text-fg-body">{fmt.money(o.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
