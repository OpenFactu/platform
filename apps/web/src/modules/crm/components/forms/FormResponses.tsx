import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Table, useToast, type TableColumn } from '@openfactu/ui';
import { Download } from 'lucide-react';
import { useFormat } from '@/hooks/useFormat';
import { downloadPdf } from '@/utils/downloadPdf';
import { formsApi } from '../../api';
import type { CrmForm, FormResponse } from '../../domain/forms';

/** Respuestas una a una, con quién respondió y la oportunidad que creó. */
export const FormResponses: React.FC<{ form: CrmForm }> = ({ form }) => {
  const fmt = useFormat();
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<FormResponse[] | null>(null);
  useEffect(() => {
    formsApi
      .responses(form.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [form.id]);

  const columns = useMemo<TableColumn<FormResponse>[]>(() => {
    const questions = form.fields.filter((f) => f.type !== 'section').slice(0, 6);
    return [
      {
        header: 'Fecha',
        id: 'date',
        accessor: (r) => fmt.date(r.createdAt),
        card: 'meta',
        sortable: true,
        sortAccessor: (r) => r.createdAt,
      },
      {
        header: 'Quién',
        id: 'who',
        accessor: (r) => r.contactName || r.partnerName || r.opportunityTitle || 'Anónimo',
        card: 'title',
      },
      ...questions.map<TableColumn<FormResponse>>((q) => ({
        header: q.label,
        id: q.id,
        accessor: (r) => {
          const v = r.answers?.[q.id];
          return Array.isArray(v) ? v.join(', ') : v === undefined ? '—' : String(v);
        },
      })),
    ];
  }, [form.fields, fmt]);

  const exportCsv = async () => {
    try {
      await downloadPdf(`/api/crm/forms/${form.id}/export`, `${form.slug}.csv`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo exportar');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="secondary" size="sm" onClick={exportCsv}>
          <Download size={14} /> Exportar CSV
        </Button>
      </div>
      <Table
        columns={columns}
        data={rows ?? []}
        isLoading={rows === null}
        emptyMessage="Aún no hay respuestas."
        ariaLabel="Respuestas"
        onRowClick={(r) => r.opportunityId && navigate(`/crm/opportunities/${r.opportunityId}`)}
        renderExpanded={(r) => (
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
            {form.fields
              .filter((f) => f.type !== 'section')
              .map((f) => {
                const v = r.answers?.[f.id];
                return (
                  <div key={f.id}>
                    <dt className="text-xs text-fg-muted">{f.label}</dt>
                    <dd className="text-sm text-fg-body whitespace-pre-wrap">
                      {Array.isArray(v) ? v.join(', ') : v === undefined ? '—' : String(v)}
                    </dd>
                  </div>
                );
              })}
          </dl>
        )}
      />
    </div>
  );
};
