import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, EmptyState, Skeleton, useToast } from '@openfactu/ui';
import { ArrowDown, ArrowUp, CreditCard, Link2, ScrollText } from 'lucide-react';
import { useTabs } from '../../context/TabsContext';
import { useFormat } from '../../hooks/useFormat';
import { DocType, DOC_TYPE_LABELS, DOC_TYPE_ROUTES } from '@openfactu/common';

interface DocRef {
  type: DocType;
  id: string;
  code: string;
  date: string;
  total: number;
  status: string;
  /** Saltos hasta el documento consultado: negativo hacia atrás, positivo hacia delante. */
  depth: number;
}

interface LinkedData {
  parents: DocRef[];
  children: DocRef[];
  journalEntries: Array<{ id: string; number: number; date: string; status: string }>;
  payments: Array<{ id: string; date: string; amount: number; reference: string | null }>;
}

interface Props {
  type: DocType;
  id: string;
  /** Código del doc actual para mostrarlo resaltado en la cadena. */
  currentCode?: string;
  onNavigated?: () => void;
}

const JOURNAL_LABEL: Record<string, string> = {
  posted: 'Asentado',
  reversed: 'Reversado',
};

/** Un eslabón de la cadena: punto sobre la línea vertical + ficha del documento. */
const ChainRow: React.FC<{
  eyebrow: string;
  code: string;
  meta?: string;
  right?: React.ReactNode;
  tone?: 'current' | 'normal' | 'success' | 'info';
  onClick?: () => void;
}> = ({ eyebrow, code, meta, right, tone = 'normal', onClick }) => {
  const dot =
    tone === 'current'
      ? 'bg-accent ring-4 ring-accent/20'
      : tone === 'success'
        ? 'bg-success'
        : tone === 'info'
          ? 'bg-info'
          : 'bg-border-strong';

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-black uppercase tracking-wider text-fg-subtle">
          {eyebrow}
        </div>
        <div className="font-mono font-bold text-sm text-fg-default truncate">{code}</div>
        {meta && <div className="text-[11px] text-fg-muted">{meta}</div>}
      </div>
      {right}
    </>
  );

  return (
    <li className="relative pl-8 pb-3 last:pb-0">
      {/* Espina vertical: se corta en el último eslabón para no dejar un rabo suelto. */}
      <span
        className="absolute left-[7px] top-4 bottom-0 w-px bg-border-subtle last:hidden"
        aria-hidden
      />
      <span className={`absolute left-0 top-2 h-[15px] w-[15px] rounded-full ${dot}`} aria-hidden />
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="w-full flex items-center gap-3 text-left px-3 py-2 rounded-xs border border-border-default bg-bg-card hover:border-accent hover:bg-bg-hover transition-colors"
        >
          {body}
        </button>
      ) : (
        <div
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xs border ${
            tone === 'current' ? 'border-accent bg-accent/5' : 'border-border-default bg-bg-card'
          }`}
        >
          {body}
        </div>
      )}
    </li>
  );
};

const GroupTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({
  icon,
  children,
}) => (
  <div className="flex items-center gap-1.5 mb-2 text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">
    {icon}
    {children}
  </div>
);

/**
 * Trazabilidad de un documento, como línea de tiempo vertical.
 *
 * El servidor devuelve la cadena ENTERA en ambos sentidos con un `depth` por
 * documento (negativo hacia atrás, positivo hacia delante), no solo el salto
 * inmediato: un presupuesto → pedido → albarán → factura se ve de una pieza.
 * Se pinta en vertical y no en horizontal porque la dirección es la
 * información principal ("de dónde viene" y "en qué acabó") y así una cadena
 * larga no obliga a desplazarse en horizontal.
 */
export const TraceabilityPopupBody: React.FC<Props> = ({ type, id, currentCode, onNavigated }) => {
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();
  const [data, setData] = useState<LinkedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    coreApi
      .get(`/api/document-links?type=${type}&id=${id}`)
      .then((d) => {
        if (d.error) toast.error(d.error);
        else setData(d);
      })
      .catch(() => toast.error('Error al cargar trazabilidad'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  // Los orígenes se ordenan del más lejano al más cercano, para leerlos de
  // arriba abajo hasta llegar al documento actual.
  const origins = useMemo(
    () => [...(data?.parents ?? [])].sort((a, b) => a.depth - b.depth),
    [data],
  );
  const derived = useMemo(
    () => [...(data?.children ?? [])].sort((a, b) => a.depth - b.depth),
    [data],
  );

  const go = (ref: DocRef) => {
    openTab(`${DOC_TYPE_ROUTES[ref.type]}/${ref.id}`, { title: ref.code });
    onNavigated?.();
  };

  const docMeta = (d: DocRef) =>
    [d.date ? fmt.date(d.date) : null, d.total ? fmt.money(d.total) : null]
      .filter(Boolean)
      .join(' · ');

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton variant="rect" height={52} radius="xs" />
        <Skeleton variant="rect" height={52} radius="xs" delayMs={80} />
        <Skeleton variant="rect" height={52} radius="xs" delayMs={160} />
      </div>
    );
  }

  const payments = data?.payments ?? [];
  const journalEntries = data?.journalEntries ?? [];
  const isolated =
    origins.length === 0 && derived.length === 0 && payments.length === 0 && !journalEntries.length;

  if (isolated) {
    return (
      <EmptyState
        icon={<Link2 size={28} />}
        title="Sin documentos enlazados"
        hint="Cuando este documento origine otro o se genere desde uno, aquí aparecerá la cadena completa."
      />
    );
  }

  return (
    <div className="space-y-5">
      {origins.length > 0 && (
        <section>
          <GroupTitle icon={<ArrowUp size={12} />}>
            Viene de ({origins.length} {origins.length === 1 ? 'documento' : 'documentos'})
          </GroupTitle>
          <ul>
            {origins.map((d) => (
              <ChainRow
                key={`${d.type}:${d.id}`}
                eyebrow={DOC_TYPE_LABELS[d.type]}
                code={d.code}
                meta={docMeta(d)}
                right={d.status ? <Badge variant="neutral">{d.status}</Badge> : undefined}
                onClick={() => go(d)}
              />
            ))}
          </ul>
        </section>
      )}

      <section>
        <GroupTitle icon={<Link2 size={12} />}>Este documento</GroupTitle>
        <ul>
          <ChainRow
            eyebrow={DOC_TYPE_LABELS[type]}
            code={currentCode || '(actual)'}
            tone="current"
          />
        </ul>
      </section>

      {derived.length > 0 && (
        <section>
          <GroupTitle icon={<ArrowDown size={12} />}>
            Ha generado ({derived.length} {derived.length === 1 ? 'documento' : 'documentos'})
          </GroupTitle>
          <ul>
            {derived.map((d) => (
              <ChainRow
                key={`${d.type}:${d.id}`}
                eyebrow={DOC_TYPE_LABELS[d.type]}
                code={d.code}
                meta={docMeta(d)}
                right={d.status ? <Badge variant="neutral">{d.status}</Badge> : undefined}
                onClick={() => go(d)}
              />
            ))}
          </ul>
        </section>
      )}

      {(payments.length > 0 || journalEntries.length > 0) && (
        <section>
          <GroupTitle icon={<CreditCard size={12} />}>Cobros y contabilidad</GroupTitle>
          <ul>
            {payments.map((p) => (
              <ChainRow
                key={p.id}
                tone="success"
                eyebrow="Cobro / pago"
                code={fmt.money(p.amount)}
                meta={[fmt.date(p.date), p.reference ? `Ref ${p.reference}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ))}
            {journalEntries.map((j) => (
              <ChainRow
                key={j.id}
                tone="info"
                eyebrow="Asiento contable"
                code={`Nº ${j.number || '—'}`}
                meta={j.date ? fmt.date(j.date) : undefined}
                right={
                  <Badge variant={j.status === 'posted' ? 'success' : 'neutral'}>
                    {JOURNAL_LABEL[j.status] || 'Borrador'}
                  </Badge>
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
