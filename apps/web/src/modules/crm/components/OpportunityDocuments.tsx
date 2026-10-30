import { useI18n } from '@/i18n/I18nContext';
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
  O: { label: 'crm.quoteStatus.open', variant: 'info' },
  A: { label: 'crm.quoteStatus.accepted', variant: 'success' },
  R: { label: 'crm.quoteStatus.rejected', variant: 'error' },
  X: { label: 'crm.quoteStatus.cancelled', variant: 'neutral' },
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
  const { t } = useI18n();
  const navigate = useNavigate();

  const columns: TableColumn<OpportunityDocument>[] = [
    {
      header: t('crm.documents.document'),
      id: 'type',
      accessor: (d) => t(DOC_TYPE_LABEL[d.docType]),
      card: 'meta',
    },
    {
      header: t('crm.common.code'),
      id: 'code',
      accessor: 'code',
      primary: true,
      card: 'title',
    },
    {
      header: t('crm.common.date'),
      id: 'date',
      accessor: (d) => fmt.date(d.date),
      card: 'subtitle',
    },
    {
      header: t('crm.common.status'),
      id: 'status',
      card: 'status',
      cell: (d) => {
        const s = d.docType === 'SQ' ? QUOTE_STATUS[d.status] : undefined;
        if (isExpired(d)) return <Badge variant="warning">{t('crm.quoteStatus.expired')}</Badge>;
        return s ? <Badge variant={s.variant}>{t(s.label)}</Badge> : null;
      },
    },
    {
      header: t('crm.common.total'),
      id: 'total',
      accessor: (d) => fmt.money(d.total),
      align: 'right',
    },
  ];

  return (
    <Table
      columns={columns}
      data={documents}
      rowKey={(d) => `${d.docType}-${d.id}`}
      onRowClick={(d) => navigate(DOC_ROUTE[d.docType](d.id))}
      density="compact"
      ariaLabel={t('crm.documents.ariaLabel')}
      emptyMessage={
        <EmptyState
          variant="compact"
          icon={<FileText size={18} />}
          title={t('crm.documents.empty')}
          hint={t('crm.documents.emptyHint')}
        />
      }
    />
  );
};
