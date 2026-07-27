import { coreApi } from '@/shared/api';
import React, { useCallback, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { CommandPalette, useCommandPalette } from '@openfactu/ui';
import type { CommandSection } from '@openfactu/ui';
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

/**
 * Búsqueda global.
 *
 * Es una paleta de comandos y no un campo con desplegable: el desplegable
 * colgaba de un `<input>` de la cabecera, así que el autocompletar del
 * navegador se pintaba encima de los resultados, y en pantallas estrechas la
 * lista no cabía. La paleta se abre centrada, se maneja entera con el teclado
 * y el campo de la cabecera pasa a ser solo el disparador.
 */
export const GlobalSearch: React.FC = () => {
  const { user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const { open, openPalette, close } = useCommandPalette({ shortcut: 'mod+k' });
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Modo servidor: la paleta no filtra en cliente, solo avisa del término
  // (ya con su propio debounce) y pinta lo que le devolvamos.
  const runSearch = useCallback(
    async (term: string) => {
      if (term.trim().length < 2) {
        setResults(EMPTY);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const res = await coreApi.raw('GET', `/api/search?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error('http');
        setResults(res.data as SearchResults);
      } catch {
        setResults(EMPTY);
      } finally {
        setLoading(false);
      }
    },
    [user?.tenantId],
  );

  const go = useCallback(
    (path: string, title?: string) => {
      close();
      setResults(EMPTY);
      openTab(path, title ? { title } : undefined);
    },
    [close, openTab],
  );

  const sections = useMemo<CommandSection[]>(() => {
    /**
     * `perItemRoute` distingue las entidades que tienen pantalla propia
     * (`/sales/invoices/:id`) de las que solo tienen listado: para estas
     * últimas se abre la lista, porque no hay ruta de detalle a la que ir.
     */
    const defs = [
      {
        key: 'partners',
        label: 'Interlocutores',
        icon: <Users size={14} />,
        route: '/partners',
        perItemRoute: false,
        rows: results.partners.map((p) => ({
          id: p.id,
          label: p.name,
          description: `${p.code} · ${p.nif}`,
          keywords: `${p.code} ${p.nif}`,
        })),
      },
      {
        key: 'items',
        label: 'Artículos',
        icon: <Package size={14} />,
        route: '/items',
        perItemRoute: false,
        rows: results.items.map((i) => ({
          id: i.id,
          label: i.name,
          description: i.code,
          keywords: i.code,
        })),
      },
      {
        key: 'salesInvoices',
        label: 'Facturas de venta',
        icon: <FileStack size={14} />,
        route: '/sales/invoices',
        perItemRoute: true,
        rows: results.salesInvoices.map((d) => ({
          id: d.id,
          label: d.docCode,
          description: `${d.partnerName} · ${fmt.money(d.total)}`,
          keywords: d.partnerName,
        })),
      },
      {
        key: 'purchaseInvoices',
        label: 'Facturas de compra',
        icon: <FileStack size={14} />,
        route: '/purchases/invoices',
        perItemRoute: true,
        rows: results.purchaseInvoices.map((d) => ({
          id: d.id,
          label: d.docCode,
          description: `${d.partnerName} · ${fmt.money(d.total)}`,
          keywords: d.partnerName,
        })),
      },
      {
        key: 'salesDeliveryNotes',
        label: 'Albaranes de venta',
        icon: <Truck size={14} />,
        route: '/sales/delivery-notes',
        perItemRoute: true,
        rows: results.salesDeliveryNotes.map((d) => ({
          id: d.id,
          label: d.docCode,
          description: `${d.partnerName} · ${fmt.money(d.total)}`,
          keywords: d.partnerName,
        })),
      },
      {
        key: 'purchaseDeliveryNotes',
        label: 'Albaranes de compra',
        icon: <Truck size={14} />,
        route: '/purchases/delivery-notes',
        perItemRoute: true,
        rows: results.purchaseDeliveryNotes.map((d) => ({
          id: d.id,
          label: d.docCode,
          description: `${d.partnerName} · ${fmt.money(d.total)}`,
          keywords: d.partnerName,
        })),
      },
      {
        key: 'salesOrders',
        label: 'Pedidos de venta',
        icon: <FileDigit size={14} />,
        route: '/sales-orders',
        perItemRoute: true,
        rows: results.salesOrders.map((d) => ({
          id: d.id,
          label: d.docCode,
          description: `${d.partnerName} · ${fmt.money(d.total)}`,
          keywords: d.partnerName,
        })),
      },
      {
        key: 'purchaseOrders',
        label: 'Pedidos de compra',
        icon: <FileDigit size={14} />,
        route: '/purchase-orders',
        perItemRoute: true,
        rows: results.purchaseOrders.map((d) => ({
          id: d.id,
          label: d.docCode,
          description: `${d.partnerName} · ${fmt.money(d.total)}`,
          keywords: d.partnerName,
        })),
      },
      {
        key: 'journalEntries',
        label: 'Asientos',
        icon: <ScrollText size={14} />,
        route: '/journal-entries',
        perItemRoute: false,
        rows: results.journalEntries.map((j) => ({
          id: j.id,
          label: `Nº ${j.number}`,
          description: j.description || fmt.date(j.date),
          keywords: '',
        })),
      },
      {
        key: 'employees',
        label: 'Empleados',
        icon: <UserRound size={14} />,
        route: '/hr/employees',
        perItemRoute: false,
        rows: results.employees.map((e) => ({
          id: e.id,
          label: `${e.firstName} ${e.lastName}`,
          description: `${e.code}${e.email ? ` · ${e.email}` : ''}`,
          keywords: e.code,
        })),
      },
      {
        key: 'internalOrders',
        label: 'Proyectos',
        icon: <Briefcase size={14} />,
        route: '/internal-orders',
        perItemRoute: false,
        rows: results.internalOrders.map((p) => ({
          id: p.id,
          label: p.name,
          description: `${p.code} · ${p.status}`,
          keywords: p.code,
        })),
      },
      {
        key: 'chartOfAccounts',
        label: 'Plan contable',
        icon: <BookOpen size={14} />,
        route: '/chart-of-accounts',
        perItemRoute: false,
        rows: results.chartOfAccounts.map((a) => ({
          id: a.id,
          label: `${a.code} · ${a.name}`,
          description: a.type,
          keywords: a.code,
        })),
      },
    ];

    return defs
      .filter((d) => d.rows.length > 0)
      .map((d) => ({
        key: d.key,
        label: d.label,
        icon: d.icon,
        items: d.rows.map((r) => ({
          id: r.id,
          label: r.label,
          description: r.description,
          keywords: r.keywords,
          onSelect: () => (d.perItemRoute ? go(`${d.route}/${r.id}`, r.label) : go(d.route)),
        })),
      }));
  }, [results, fmt, go]);

  return (
    <>
      {/*
        Disparador con forma de campo de búsqueda. Es un `<button>` y no un
        `SearchInput` a propósito: no se escribe aquí, solo abre la paleta, y
        un input de verdad volvería a atraer el autocompletar del navegador.
      */}
      <button
        type="button"
        onClick={openPalette}
        className="group flex items-center gap-2 w-full max-w-md h-9 px-3 rounded-xs border border-border-default bg-bg-muted text-fg-subtle hover:border-border-strong hover:text-fg-muted transition-colors"
      >
        <Search size={14} className="shrink-0" />
        <span className="flex-1 text-left text-sm truncate">
          Buscar interlocutores, artículos o documentos…
        </span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-xs border border-border-default bg-bg-card text-[10px] font-mono text-fg-subtle">
          Ctrl+K
        </kbd>
      </button>

      <CommandPalette
        open={open}
        onClose={close}
        sections={sections}
        onSearch={runSearch}
        debounceMs={220}
        loading={loading}
        placeholder="Buscar interlocutores, artículos o documentos…"
        emptyMessage="Sin resultados. Prueba con un código, un NIF o parte del nombre."
      />
    </>
  );
};
