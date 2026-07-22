import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import { Badge, useToast } from '@openfactu/ui';
import { ChevronRight, ScrollText, CreditCard, FileDigit } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTabs } from '../../context/TabsContext';
import { useFormat } from '../../hooks/useFormat';
import { LinkedDocumentsPanel } from './LinkedDocumentsPanel';
import { DocType, DOC_TYPE_LABELS, DOC_TYPE_ROUTES } from '@openfactu/common';

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

/** Orden en la cadena (izq → der). */
const CHAIN_ORDER: DocType[] = ['SO', 'PO', 'SDN', 'PDN', 'SINV', 'PINV'];

interface Props {
  type: DocType;
  id: string;
  /** Código del doc actual para mostrarlo resaltado en la cadena. */
  currentCode?: string;
  onNavigated?: () => void;
}

/**
 * Cuerpo del popup de trazabilidad. Arriba renderiza una **cadena horizontal**
 * con los eslabones detectados (pedido → albarán → factura → cobro → asiento)
 * resaltando el documento actual. Debajo reutiliza `LinkedDocumentsPanel` en
 * modo `bare` para las secciones detalladas.
 */
export const TraceabilityPopupBody: React.FC<Props> = ({ type, id, currentCode, onNavigated }) => {
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();
  const [data, setData] = useState<LinkedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    coreApi.get(`/api/document-links?type=${type}&id=${id}`)
      .then((d) => {
        if (d.error) toast.error(d.error);
        else setData(d);
      })
      .catch(() => toast.error('Error al cargar trazabilidad'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  /**
   * Construye la cadena lineal ordenada:
   *   parents (por tipo en orden) → actual → children (por tipo en orden) → payments → journalEntries
   */
  const chain = useMemo(() => {
    if (!data) return [];
    const items: Array<
      | { kind: 'doc'; ref: DocRef; highlight?: boolean }
      | { kind: 'payment'; p: LinkedData['payments'][number] }
      | { kind: 'journal'; j: LinkedData['journalEntries'][number] }
    > = [];

    const byTypeParents = [...data.parents].sort(
      (a, b) => CHAIN_ORDER.indexOf(a.type) - CHAIN_ORDER.indexOf(b.type),
    );
    byTypeParents.forEach((ref) => items.push({ kind: 'doc', ref }));

    // Documento actual — si tenemos el código real lo pintamos; si no, placeholder.
    items.push({
      kind: 'doc',
      ref: { type, id, code: currentCode || '(actual)', date: '', total: 0, status: '' },
      highlight: true,
    });

    const byTypeChildren = [...data.children].sort(
      (a, b) => CHAIN_ORDER.indexOf(a.type) - CHAIN_ORDER.indexOf(b.type),
    );
    byTypeChildren.forEach((ref) => items.push({ kind: 'doc', ref }));

    data.payments.forEach((p) => items.push({ kind: 'payment', p }));
    data.journalEntries.forEach((j) => items.push({ kind: 'journal', j }));

    return items;
  }, [data, type, id]);

  if (loading) {
    return <div className="text-sm text-slate-400 text-center py-10">Cargando trazabilidad…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Cadena horizontal */}
      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-700 p-5 overflow-x-auto">
        <div className="flex items-center gap-2 min-w-fit">
          {chain.length === 0 ? (
            <div className="w-full text-center text-sm text-slate-400 italic py-4">
              Sin eslabones aún
            </div>
          ) : (
            chain.map((item, i) => {
              const isLast = i === chain.length - 1;
              return (
                <React.Fragment key={i}>
                  {item.kind === 'doc' && (
                    <button
                      onClick={() => {
                        if (item.highlight) return;
                        openTab(`${DOC_TYPE_ROUTES[item.ref.type]}/${item.ref.id}`, {
                          title: item.ref.code,
                        });
                        onNavigated?.();
                      }}
                      disabled={item.highlight}
                      className={`flex-shrink-0 px-3 py-2 rounded-lg border-2 transition-all text-left ${
                        item.highlight
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/20 cursor-default ring-2 ring-blue-200 dark:ring-blue-500/30'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-500/50 hover:-translate-y-0.5'
                      }`}
                    >
                      <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {DOC_TYPE_LABELS[item.ref.type]}
                      </div>
                      <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                        {item.ref.code}
                      </div>
                      {item.ref.total > 0 && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {fmt.money(item.ref.total)}
                        </div>
                      )}
                    </button>
                  )}
                  {item.kind === 'payment' && (
                    <div className="flex-shrink-0 px-3 py-2 rounded-lg border-2 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10">
                      <div className="text-[9px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                        <CreditCard size={10} /> Cobro/Pago
                      </div>
                      <div className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-200">
                        {fmt.money(item.p.amount)}
                      </div>
                      {item.p.reference && (
                        <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                          Ref {item.p.reference}
                        </div>
                      )}
                    </div>
                  )}
                  {item.kind === 'journal' && (
                    <div className="flex-shrink-0 px-3 py-2 rounded-lg border-2 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10">
                      <div className="text-[9px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1">
                        <ScrollText size={10} /> Asiento
                      </div>
                      <div className="font-mono font-bold text-sm text-blue-700 dark:text-blue-200">
                        Nº {item.j.number || '—'}
                      </div>
                      <Badge variant={item.j.status === 'posted' ? 'success' : 'neutral'}>
                        {item.j.status === 'posted'
                          ? 'Asentado'
                          : item.j.status === 'reversed'
                            ? 'Reversado'
                            : 'Borrador'}
                      </Badge>
                    </div>
                  )}
                  {!isLast && (
                    <ChevronRight
                      size={20}
                      className="text-slate-400 dark:text-slate-600 flex-shrink-0"
                    />
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      {/* Secciones detalladas debajo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LinkedDocumentsPanel type={type} id={id} bare />
      </div>
    </div>
  );
};
