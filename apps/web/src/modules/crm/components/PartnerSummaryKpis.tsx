import { useI18n } from '@/i18n/I18nContext';
import React, { useEffect, useState } from 'react';
import { KpiCard } from '@openfactu/ui';
import { useFormat } from '@/hooks/useFormat';
import { crmPartnersApi } from '../api';
import type { PartnerSummary } from '../domain/crm';

/** Cifras del cliente. Las que el usuario no puede ver no se pintan. */
export const PartnerSummaryKpis: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const fmt = useFormat();
  const { t } = useI18n();
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
      label: t('crm.summary.revenue12m'),
      value: fmt.money(summary.revenue12m),
      sub: summary.lastPurchaseAt
        ? t('crm.summary.lastPurchase', { date: fmt.date(summary.lastPurchaseAt) })
        : t('crm.summary.noPurchases'),
    });
  if (summary.pendingReceivable !== null)
    cards.push({
      label: t('crm.summary.pendingReceivable'),
      value: fmt.money(summary.pendingReceivable),
    });
  if (summary.openQuotes)
    cards.push({
      label: t('crm.summary.openQuotes'),
      value: fmt.money(summary.openQuotes.amount),
      sub: t('crm.summary.quotesCount', { count: summary.openQuotes.count }),
    });
  cards.push({
    label: t('crm.summary.openOpportunities'),
    value: fmt.money(summary.openOpportunities.amount),
    sub: t('crm.summary.opportunitiesCount', { count: summary.openOpportunities.count }),
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <KpiCard key={c.label} label={c.label} value={c.value} sub={c.sub} />
      ))}
    </div>
  );
};
