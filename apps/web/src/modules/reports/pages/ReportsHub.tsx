import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import {
  ScrollText,
  BookOpenCheck,
  Scale,
  TrendingUp,
  Landmark,
  Receipt,
  PieChart,
  Package,
  UserCheck,
  Users,
  Banknote,
  LineChart as LineChartIcon,
  FileBarChart,
  Briefcase,
  Building2,
  TrendingDown,
  Wallet,
  Warehouse,
  RotateCw,
  ArrowLeftRight,
  ChevronRight,
} from 'lucide-react';

interface ReportCardProps {
  title: string;
  description: string;
  icon: any;
  path: string;
}

/**
 * Tarjeta-enlace a un informe. Sigue siendo un `<button>` y no un `Card` del
 * paquete porque toda la superficie es clicable (es navegación, no un panel de
 * contenido), pero el color sale de los tokens: antes cada informe llevaba su
 * pareja `text-blue-600 / bg-blue-50` escrita a mano, así que el mosaico se
 * veía azul-índigo-teal aunque la empresa tuviera un tema grafito o granate.
 */
const ReportCard: React.FC<ReportCardProps> = ({ title, description, icon: Icon, path }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(path)}
      className="group text-left p-5 rounded-lg border border-border-default bg-bg-card hover:border-accent hover:shadow-k-md transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="p-2.5 rounded-lg bg-accent/10 text-accent shrink-0">
          <Icon size={18} />
        </div>
        <ChevronRight
          size={16}
          className="text-fg-subtle group-hover:text-accent group-hover:translate-x-0.5 transition-all"
        />
      </div>
      <h3 className="mt-3 font-black text-fg-default text-sm tracking-tight">{title}</h3>
      <p className="text-[11px] text-fg-muted mt-0.5 line-clamp-2">{description}</p>
    </button>
  );
};

interface HubProps {
  category: 'accounting' | 'management' | 'hr' | 'stock';
}

/** Claves i18n: título, subtítulo y tarjetas se traducen al pintar. */
const CATEGORIES = {
  accounting: {
    title: 'reports.hub.accounting.title',
    subtitle: 'reports.hub.accounting.subtitle',
    items: [
      {
        title: 'reports.hub.accounting.items.journal.title',
        description: 'reports.hub.accounting.items.journal.description',
        icon: ScrollText,
        path: '/reports/accounting/journal',
      },
      {
        title: 'reports.hub.accounting.items.ledger.title',
        description: 'reports.hub.accounting.items.ledger.description',
        icon: BookOpenCheck,
        path: '/reports/accounting/ledger',
      },
      {
        title: 'reports.hub.accounting.items.trialBalance.title',
        description: 'reports.hub.accounting.items.trialBalance.description',
        icon: Scale,
        path: '/reports/accounting/trial-balance',
      },
      {
        title: 'reports.hub.accounting.items.pl.title',
        description: 'reports.hub.accounting.items.pl.description',
        icon: TrendingUp,
        path: '/reports/accounting/pl',
      },
      {
        title: 'reports.hub.accounting.items.balanceSheet.title',
        description: 'reports.hub.accounting.items.balanceSheet.description',
        icon: Landmark,
        path: '/reports/accounting/balance-sheet',
      },
      {
        title: 'reports.hub.accounting.items.vat.title',
        description: 'reports.hub.accounting.items.vat.description',
        icon: Receipt,
        path: '/reports/accounting/vat',
      },
    ],
  },
  management: {
    title: 'reports.hub.management.title',
    subtitle: 'reports.hub.management.subtitle',
    items: [
      {
        title: 'reports.hub.management.items.profitCustomer.title',
        description: 'reports.hub.management.items.profitCustomer.description',
        icon: PieChart,
        path: '/reports/management/profit-customer',
      },
      {
        title: 'reports.hub.management.items.profitItem.title',
        description: 'reports.hub.management.items.profitItem.description',
        icon: Package,
        path: '/reports/management/profit-item',
      },
      {
        title: 'reports.hub.management.items.profitProject.title',
        description: 'reports.hub.management.items.profitProject.description',
        icon: Briefcase,
        path: '/reports/management/profit-project',
      },
      {
        title: 'reports.hub.management.items.profitCostCenter.title',
        description: 'reports.hub.management.items.profitCostCenter.description',
        icon: Building2,
        path: '/reports/management/profit-cost-center',
      },
      {
        title: 'reports.hub.management.items.executive.title',
        description: 'reports.hub.management.items.executive.description',
        icon: FileBarChart,
        path: '/reports/management/executive',
      },
      {
        title: 'reports.hub.management.items.agingReceivables.title',
        description: 'reports.hub.management.items.agingReceivables.description',
        icon: TrendingDown,
        path: '/reports/management/aging-receivables',
      },
      {
        title: 'reports.hub.management.items.agingPayables.title',
        description: 'reports.hub.management.items.agingPayables.description',
        icon: Wallet,
        path: '/reports/management/aging-payables',
      },
      {
        title: 'reports.hub.management.items.cashflow.title',
        description: 'reports.hub.management.items.cashflow.description',
        icon: LineChartIcon,
        path: '/reports/management/cashflow',
      },
    ],
  },
  hr: {
    title: 'reports.hub.hr.title',
    subtitle: 'reports.hub.hr.subtitle',
    items: [
      {
        title: 'reports.hub.hr.items.payslip.title',
        description: 'reports.hub.hr.items.payslip.description',
        icon: Banknote,
        path: '/reports/hr/payslip',
      },
      {
        title: 'reports.hub.hr.items.laborCost.title',
        description: 'reports.hub.hr.items.laborCost.description',
        icon: UserCheck,
        path: '/reports/hr/labor-cost',
      },
      {
        title: 'reports.hub.hr.items.headcount.title',
        description: 'reports.hub.hr.items.headcount.description',
        icon: Users,
        path: '/reports/hr/headcount',
      },
    ],
  },
  stock: {
    title: 'reports.hub.stock.title',
    subtitle: 'reports.hub.stock.subtitle',
    items: [
      {
        title: 'reports.hub.stock.items.valuation.title',
        description: 'reports.hub.stock.items.valuation.description',
        icon: Warehouse,
        path: '/reports/stock/valuation',
      },
      {
        title: 'reports.hub.stock.items.rotation.title',
        description: 'reports.hub.stock.items.rotation.description',
        icon: RotateCw,
        path: '/reports/stock/rotation',
      },
      {
        title: 'reports.hub.stock.items.movements.title',
        description: 'reports.hub.stock.items.movements.description',
        icon: ArrowLeftRight,
        path: '/reports/stock/movements',
      },
    ],
  },
};

export const ReportsHub: React.FC<HubProps> = ({ category }) => {
  const { t } = useI18n();
  const cat = CATEGORIES[category];
  return (
    <div className="p-8 w-full space-y-6 animate-in fade-in duration-500">
      <PageHeader title={t(cat.title)} subtitle={t(cat.subtitle)} size="lg" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cat.items.map((item) => (
          <ReportCard
            key={item.path}
            {...item}
            title={t(item.title)}
            description={t(item.description)}
          />
        ))}
      </div>
    </div>
  );
};
