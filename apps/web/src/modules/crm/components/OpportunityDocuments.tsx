import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, EmptyState } from '@openfactu/ui';
import { FileText } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { DOC_ROUTE, DOC_TYPE_LABEL, type OpportunityDocument } from '../domain/crm';

const QUOTE_STATUS: Record<
  string,
  { label: string; variant: 'info' | 'success' | 'error' | 'neutral' }
> = {
  O: { label: 'Abierto', variant: 'info' },
  A: { label: 'Aceptado', variant: 'success' },
  R: { label: 'Rechazado', variant: 'error' },
  X: { label: 'Cancelado', variant: 'neutral' },
};

/** Presupuestos, pedidos y facturas que han salido de la oportunidad. */
export const OpportunityDocuments: React.FC<{ documents: OpportunityDocument[] }> = ({
  documents,
}) => {
  const fmt = useFormat();
  const navigate = useNavigate();
  if (documents.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<FileText size={18} />}
        title="Sin documentos"
        hint="Crea un presupuesto con los productos de la oportunidad."
      />
    );
  }
  return (
    <ul className="divide-y divide-border-subtle rounded-xs border border-border-default bg-bg-card">
      {documents.map((d) => {
        const quoteStatus = d.docType === 'SQ' ? QUOTE_STATUS[d.status] : undefined;
        const expired =
          d.docType === 'SQ' &&
          d.status === 'O' &&
          d.validUntil &&
          new Date(d.validUntil) < new Date();
        return (
          <li key={`${d.docType}-${d.id}`}>
            <button
              type="button"
              onClick={() => navigate(DOC_ROUTE[d.docType](d.id))}
              className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover"
            >
              <span className="text-xs text-fg-muted w-20 shrink-0">
                {DOC_TYPE_LABEL[d.docType]}
              </span>
              <span className="font-mono text-sm text-fg-default">{d.code}</span>
              <span className="text-xs text-fg-muted">{fmt.date(d.date)}</span>
              <span className="flex-1" />
              {expired && <Badge variant="warning">Caducado</Badge>}
              {quoteStatus && <Badge variant={quoteStatus.variant}>{quoteStatus.label}</Badge>}
              <span className="text-sm tabular-nums text-fg-body">{fmt.money(d.total)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
