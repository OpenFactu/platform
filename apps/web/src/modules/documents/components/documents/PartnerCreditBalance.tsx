import React, { useEffect, useState } from 'react';
import { Card, List } from '@openfactu/ui';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';
import { creditNoteApi, type CreditBalance } from '../../api';
import { invoicesRoute, type InvoiceSide } from '../../domain/creditNote';

const SIDES: InvoiceSide[] = ['sales', 'purchase'];

/** Abonos con saldo de un interlocutor. Sin saldo, o sin permiso para verlo, no se pinta. */
export const PartnerCreditBalance: React.FC<{ partnerId: string }> = ({ partnerId }) => {
  const { t } = useI18n();
  const fmt = useFormat();
  const { openTab } = useTabs();
  const [balances, setBalances] = useState<Partial<Record<InvoiceSide, CreditBalance>>>({});

  useEffect(() => {
    let alive = true;
    for (const side of SIDES) {
      creditNoteApi
        .balance(side, partnerId)
        .then((balance) => {
          if (alive) setBalances((current) => ({ ...current, [side]: balance }));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [partnerId]);

  const rows = SIDES.flatMap((side) =>
    (balances[side]?.notes ?? []).map((note) => ({
      id: note.id,
      title: t(`doc.creditNote.balanceSide.${side}`, { docNum: note.docNum }),
      subtitle: fmt.date(note.date),
      meta: fmt.money(note.available),
      onClick: () => openTab(`${invoicesRoute(side)}/${note.id}`),
    })),
  );
  if (rows.length === 0) return null;

  return (
    <Card title={t('doc.creditNote.balanceTitle')} subtitle={t('doc.creditNote.balanceHint')}>
      <List items={rows} />
    </Card>
  );
};
