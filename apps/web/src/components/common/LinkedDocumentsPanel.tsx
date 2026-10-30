import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Badge, useToast } from '@openfactu/ui';
import { ArrowUp, ArrowDown, ScrollText, CreditCard, Link2, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTabs } from '../../context/TabsContext';
import { useFormat } from '../../hooks/useFormat';
import { useI18n } from '@/i18n/I18nContext';

type DocType = 'SO' | 'PO' | 'SDN' | 'PDN' | 'SINV' | 'PINV' | (string & {});

interface DocRef {
  type: DocType;
  id: string;
  code: string;
  date: string;
  total: number;
  status: string;
}

interface LinkedData {
  parents: DocRef[];
  children: DocRef[];
  journalEntries: Array<{ id: string; number: number; date: string; status: string }>;
  payments: Array<{ id: string; date: string; amount: number; reference: string | null }>;
}

const TYPE_LABEL: Record<DocType, string> = {
  SQ: 'app.docTypes.SQ',
  SO: 'app.docTypes.SO',
  PO: 'app.docTypes.PO',
  SDN: 'app.docTypes.SDN',
  PDN: 'app.docTypes.PDN',
  SINV: 'app.docTypes.SINV',
  PINV: 'app.docTypes.PINV',
};

const TYPE_PATH: Record<DocType, string> = {
  SQ: '/sales/quotes',
  SO: '/sales-orders',
  PO: '/purchase-orders',
  SDN: '/sales/delivery-notes',
  PDN: '/purchases/delivery-notes',
  SINV: '/sales/invoices',
  PINV: '/purchases/invoices',
};

interface Props {
  type: DocType;
  id: string;
  /** Refresca cuando cambie este valor (útil si el doc muta). */
  refreshKey?: any;
  /** Cuando true, oculta el header "Trazabilidad" (lo pone el contenedor). */
  bare?: boolean;
}

/**
 * Panel de trazabilidad: muestra el grafo de documentos relacionados para
 * poder navegar arriba (de dónde viene) y abajo (qué generó).
 *
 *   Pedido ─► Albarán ─► Factura ─► Pago ─► Asiento
 */
export const LinkedDocumentsPanel: React.FC<Props> = ({ type, id, refreshKey, bare }) => {
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();
  const { t } = useI18n();
  const [data, setData] = useState<LinkedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    coreApi
      .get(`/api/document-links?type=${type}&id=${id}`)
      .then((d) => {
        if (d.error) {
          toast.error(d.error);
          setData(null);
        } else {
          setData(d);
        }
      })
      .catch(() => toast.error(t('app.trace.loadError')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, refreshKey]);

  const empty =
    data &&
    data.parents.length === 0 &&
    data.children.length === 0 &&
    data.journalEntries.length === 0 &&
    data.payments.length === 0;

  if (loading) {
    return (
      <div className="text-xs text-fg-subtle italic text-center p-6">{t('app.trace.loading')}</div>
    );
  }
  if (!data) return null;

  const renderDoc = (d: DocRef) => (
    <button
      key={d.id}
      onClick={() =>
        openTab(`${TYPE_PATH[d.type] ?? `/documents/${d.type}`}/${d.id}`, { title: d.code })
      }
      className="w-full group flex items-center gap-3 p-2.5 rounded-lg border border-border-subtle hover:border-accent/50 hover:bg-accent/5 transition-all text-left"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="info">{TYPE_LABEL[d.type] ? t(TYPE_LABEL[d.type]) : d.type}</Badge>
          <span className="font-mono font-black text-sm text-fg-default truncate">{d.code}</span>
        </div>
        <div className="text-[11px] text-fg-muted mt-0.5 font-mono">
          {fmt.date(d.date)} · {fmt.money(d.total)}
        </div>
      </div>
      <ChevronRight size={16} className="text-fg-subtle group-hover:text-accent shrink-0" />
    </button>
  );

  const inner = (
    <>
      {empty && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="p-3 rounded-full bg-bg-muted mb-3">
            <Link2 size={22} className="text-fg-subtle" />
          </div>
          <p className="text-sm font-bold text-fg-body">{t('app.trace.emptyTitle')}</p>
          <p className="text-xs text-fg-subtle mt-1 max-w-xs">{t('app.trace.emptyHint')}</p>
        </div>
      )}

      {data.parents.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-1.5">
            <ArrowUp size={11} /> {t('app.trace.origin')}
          </div>
          <div className="space-y-1.5">{data.parents.map(renderDoc)}</div>
        </div>
      )}

      {data.children.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-1.5">
            <ArrowDown size={11} /> {t('app.trace.derived')}
          </div>
          <div className="space-y-1.5">{data.children.map(renderDoc)}</div>
        </div>
      )}

      {data.payments.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-1.5">
            <CreditCard size={11} /> {t('app.trace.payments')}
          </div>
          <div className="space-y-1">
            {data.payments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20"
              >
                <span className="text-fg-body font-mono">
                  {fmt.date(p.date)}
                  {p.reference && (
                    <span className="ml-2 text-slate-400">
                      · {t('app.trace.ref', { ref: p.reference })}
                    </span>
                  )}
                </span>
                <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {fmt.money(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.journalEntries.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent mb-1.5">
            <ScrollText size={11} /> {t('app.trace.journalEntries')}
          </div>
          <div className="space-y-1">
            {data.journalEntries.map((je) => (
              <button
                key={je.id}
                onClick={() =>
                  openTab(`/journal-entries`, {
                    title: t('app.trace.journalEntry', { number: je.number }),
                  })
                }
                className="w-full flex items-center justify-between text-xs p-2 rounded-lg bg-accent/5 border border-accent/20 hover:bg-accent/10 transition-colors text-left"
              >
                <span className="font-mono">
                  <b>{t('app.trace.numberShort', { number: je.number || '—' })}</b> ·{' '}
                  {fmt.date(je.date)}
                </span>
                <Badge variant={je.status === 'posted' ? 'success' : 'neutral'}>
                  {je.status === 'posted'
                    ? t('app.trace.posted')
                    : je.status === 'reversed'
                      ? t('app.trace.reversed')
                      : t('app.trace.draft')}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  if (bare) return <div className="space-y-4">{inner}</div>;

  return (
    <Card className="border-border-subtle" bodyClassName="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 size={16} className="text-accent" />
        <h4 className="text-[10px] font-black uppercase text-fg-muted tracking-[0.15em]">
          {t('app.trace.title')}
        </h4>
      </div>
      {inner}
    </Card>
  );
};
