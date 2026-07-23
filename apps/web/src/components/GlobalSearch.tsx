import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Users,
  Package,
  FileStack,
  Truck,
  FileDigit,
  ScrollText,
  UserRound,
  Briefcase,
  BookOpen,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTabs } from '../context/TabsContext';
import { useFormat } from '../hooks/useFormat';

interface SearchResults {
  partners: { id: string; code: string; name: string; nif: string }[];
  items: { id: string; code: string; name: string }[];
  salesInvoices: DocResult[];
  purchaseInvoices: DocResult[];
  salesDeliveryNotes: DocResult[];
  purchaseDeliveryNotes: DocResult[];
  salesOrders: DocResult[];
  purchaseOrders: DocResult[];
  journalEntries: {
    id: string;
    number: number;
    date: string;
    description: string | null;
    status: string;
  }[];
  employees: {
    id: string;
    code: string;
    firstName: string;
    lastName: string;
    email: string | null;
  }[];
  internalOrders: { id: string; code: string; name: string; status: string }[];
  chartOfAccounts: { id: string; code: string; name: string; type: string }[];
  total: number;
}
interface DocResult {
  id: string;
  docCode: string;
  partnerName: string;
  date: string;
  total: number;
  status: string;
}

const EMPTY: SearchResults = {
  partners: [],
  items: [],
  salesInvoices: [],
  purchaseInvoices: [],
  salesDeliveryNotes: [],
  purchaseDeliveryNotes: [],
  salesOrders: [],
  purchaseOrders: [],
  journalEntries: [],
  employees: [],
  internalOrders: [],
  chartOfAccounts: [],
  total: 0,
};

export const GlobalSearch: React.FC = () => {
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Ctrl+K → focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Click fuera cierra
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    const handler = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await coreApi.raw('GET', `/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('http');
        const data: SearchResults = res.data;
        setResults(data);
      } catch {
        setResults(EMPTY);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handler);
  }, [query, token, user?.tenantId]);

  const go = (path: string, title?: string) => {
    setOpen(false);
    setQuery('');
    openTab(path, title ? { title } : undefined);
  };

  const showDropdown = open && query.trim().length >= 2;
  const noResults = !loading && showDropdown && results.total === 0;

  const sections = useMemo(
    () =>
      [
        {
          key: 'partners',
          label: 'Interlocutores',
          icon: Users,
          route: '/partners',
          perItemRoute: false,
          items: results.partners.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.code} · ${p.nif}`,
          })),
        },
        {
          key: 'items',
          label: 'Artículos',
          icon: Package,
          route: '/items',
          perItemRoute: false,
          items: results.items.map((i) => ({ id: i.id, primary: i.name, secondary: i.code })),
        },
        {
          key: 'salesInvoices',
          label: 'Facturas Venta',
          icon: FileStack,
          route: '/sales/invoices',
          perItemRoute: true,
          items: results.salesInvoices.map((d) => ({
            id: d.id,
            primary: d.docCode,
            secondary: `${d.partnerName} · ${fmt.money(d.total)}`,
          })),
        },
        {
          key: 'purchaseInvoices',
          label: 'Facturas Compra',
          icon: FileStack,
          route: '/purchases/invoices',
          perItemRoute: true,
          items: results.purchaseInvoices.map((d) => ({
            id: d.id,
            primary: d.docCode,
            secondary: `${d.partnerName} · ${fmt.money(d.total)}`,
          })),
        },
        {
          key: 'salesDeliveryNotes',
          label: 'Albaranes Venta',
          icon: Truck,
          route: '/sales/delivery-notes',
          perItemRoute: true,
          items: results.salesDeliveryNotes.map((d) => ({
            id: d.id,
            primary: d.docCode,
            secondary: `${d.partnerName} · ${fmt.money(d.total)}`,
          })),
        },
        {
          key: 'purchaseDeliveryNotes',
          label: 'Albaranes Compra',
          icon: Truck,
          route: '/purchases/delivery-notes',
          perItemRoute: true,
          items: results.purchaseDeliveryNotes.map((d) => ({
            id: d.id,
            primary: d.docCode,
            secondary: `${d.partnerName} · ${fmt.money(d.total)}`,
          })),
        },
        {
          key: 'salesOrders',
          label: 'Pedidos Venta',
          icon: FileDigit,
          route: '/sales-orders',
          perItemRoute: true,
          items: results.salesOrders.map((d) => ({
            id: d.id,
            primary: d.docCode,
            secondary: `${d.partnerName} · ${fmt.money(d.total)}`,
          })),
        },
        {
          key: 'purchaseOrders',
          label: 'Pedidos Compra',
          icon: FileDigit,
          route: '/purchase-orders',
          perItemRoute: true,
          items: results.purchaseOrders.map((d) => ({
            id: d.id,
            primary: d.docCode,
            secondary: `${d.partnerName} · ${fmt.money(d.total)}`,
          })),
        },
        {
          key: 'journalEntries',
          label: 'Asientos',
          icon: ScrollText,
          route: '/journal-entries',
          perItemRoute: false,
          items: results.journalEntries.map((j) => ({
            id: j.id,
            primary: `Nº ${j.number}`,
            secondary: j.description || fmt.date(j.date),
          })),
        },
        {
          key: 'employees',
          label: 'Empleados',
          icon: UserRound,
          route: '/hr/employees',
          perItemRoute: false,
          items: results.employees.map((e) => ({
            id: e.id,
            primary: `${e.firstName} ${e.lastName}`,
            secondary: `${e.code}${e.email ? ` · ${e.email}` : ''}`,
          })),
        },
        {
          key: 'internalOrders',
          label: 'Proyectos',
          icon: Briefcase,
          route: '/internal-orders',
          perItemRoute: false,
          items: results.internalOrders.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.code} · ${p.status}`,
          })),
        },
        {
          key: 'chartOfAccounts',
          label: 'Plan contable',
          icon: BookOpen,
          route: '/chart-of-accounts',
          perItemRoute: false,
          items: results.chartOfAccounts.map((a) => ({
            id: a.id,
            primary: `${a.code} · ${a.name}`,
            secondary: a.type,
          })),
        },
      ].filter((s) => s.items.length > 0),
    [results, fmt],
  );

  return (
    <div ref={wrapperRef} className="relative max-w-md w-full">
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search
            size={16}
            className="text-slate-400 dark:text-slate-500 group-focus-within:text-primary transition-colors"
          />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar interlocutores, artículos o documentos (Ctrl+K)..."
          className="block w-full pl-10 pr-9 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults(EMPTY);
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded"
            aria-label="Limpiar"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center">
              Buscando…
            </div>
          ) : noResults ? (
            <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center italic">
              Sin resultados para "{query}"
            </div>
          ) : (
            sections.map((section) => (
              <div
                key={section.key}
                className="border-b border-slate-100 dark:border-slate-800 last:border-0"
              >
                <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <section.icon size={11} />
                  {section.label}
                </div>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => {
                          if (section.perItemRoute) {
                            go(`${section.route}/${item.id}`, item.primary);
                          } else {
                            go(section.route);
                          }
                        }}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors"
                      >
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                          {item.primary}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.secondary}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
