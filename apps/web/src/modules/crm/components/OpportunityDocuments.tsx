import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, EmptyState, Table, type TableColumn } from '@openfactu/ui';
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

/** Un presupuesto abierto pasado de su validez. */
const isExpired = (d: OpportunityDocument) =>
  d.docType === 'SQ' && d.status === 'O' && !!d.validUntil && new Date(d.validUntil) < new Date();

/**
 * Presupuestos, pedidos, albaranes y facturas que han salido de la
 * oportunidad. En pantallas estrechas la tabla pasa a tarjetas.
 */
export const OpportunityDocuments: React.FC<{ documents: OpportunityDocument[] }> = ({
  documents,
}) => {
  const fmt = useFormat();
  const navigate = useNavigate();

  const columns: TableColumn<OpportunityDocument>[] = [
    { header: 'Documento', id: 'type', accessor: (d) => DOC_TYPE_LABEL[d.docType], card: 'meta' },
    {
      header: 'Código',
      id: 'code',
      accessor: 'code',
      primary: true,
      card: 'title',
    },
    { header: 'Fecha', id: 'date', accessor: (d) => fmt.date(d.date), card: 'subtitle' },
    {
      header: 'Estado',
      id: 'status',
      card: 'status',
      cell: (d) => {
        const s = d.docType === 'SQ' ? QUOTE_STATUS[d.status] : undefined;
        if (isExpired(d)) return <Badge variant="warning">Caducado</Badge>;
        return s ? <Badge variant={s.variant}>{s.label}</Badge> : null;
      },
    },
    { header: 'Total', id: 'total', accessor: (d) => fmt.money(d.total), align: 'right' },
  ];

  return (
    <Table
      columns={columns}
      data={documents}
      rowKey={(d) => `${d.docType}-${d.id}`}
      onRowClick={(d) => navigate(DOC_ROUTE[d.docType](d.id))}
      density="compact"
      ariaLabel="Documentos de la oportunidad"
      emptyMessage={
        <EmptyState
          variant="compact"
          icon={<FileText size={18} />}
          title="Sin documentos"
          hint="Crea un presupuesto con los productos de la oportunidad."
        />
      }
    />
  );
};
