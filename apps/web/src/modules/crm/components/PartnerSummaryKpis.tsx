import React, { useEffect, useState } from 'react';
import { KpiCard } from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import { crmPartnersApi } from '../api';
import type { PartnerSummary } from '../domain/crm';

/** Cifras del cliente. Las que el usuario no puede ver no se pintan. */
export const PartnerSummaryKpis: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const fmt = useFormat();
  const [summary, setSummary] = useState<PartnerSummary | null>(null);
  useEffect(() => {
    crmPartnersApi
      .summary(partnerId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [partnerId]);
  if (!summary) return null;

  const cards: Array<{ label: string; value: string; sub?: string }> = [];
  if (summary.revenue12m !== null)
    cards.push({
      label: 'Facturado 12 meses',
      value: fmt.money(summary.revenue12m),
      sub: summary.lastPurchaseAt
        ? `Última compra: ${fmt.date(summary.lastPurchaseAt)}`
        : 'Sin compras',
    });
  if (summary.pendingReceivable !== null)
    cards.push({ label: 'Pendiente de cobro', value: fmt.money(summary.pendingReceivable) });
  if (summary.openQuotes)
    cards.push({
      label: 'Presupuestos abiertos',
      value: fmt.money(summary.openQuotes.amount),
      sub: `${summary.openQuotes.count} presupuesto(s)`,
    });
  cards.push({
    label: 'Oportunidades abiertas',
    value: fmt.money(summary.openOpportunities.amount),
    sub: `${summary.openOpportunities.count} oportunidad(es)`,
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <KpiCard key={c.label} label={c.label} value={c.value} sub={c.sub} />
      ))}
    </div>
  );
};
