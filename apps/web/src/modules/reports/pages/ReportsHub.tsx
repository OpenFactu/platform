import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@openfactu/ui';
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

const CATEGORIES = {
  accounting: {
    title: 'Informes contables',
    subtitle: 'Diario, mayor, balances y libros fiscales.',
    items: [
      {
        title: 'Diario de asientos',
        description: 'Listado cronológico de todos los asientos contables del período.',
        icon: ScrollText,
        path: '/reports/accounting/journal',
      },
      {
        title: 'Libro mayor',
        description: 'Movimientos de una cuenta con saldo corriente.',
        icon: BookOpenCheck,
        path: '/reports/accounting/ledger',
      },
      {
        title: 'Balance sumas y saldos',
        description: 'Totales debe/haber y saldo por cuenta del período.',
        icon: Scale,
        path: '/reports/accounting/trial-balance',
      },
      {
        title: 'Cuenta de P&L',
        description: 'Ingresos menos gastos = resultado del ejercicio.',
        icon: TrendingUp,
        path: '/reports/accounting/pl',
      },
      {
        title: 'Balance de situación',
        description: 'Activo = Pasivo + Patrimonio a una fecha.',
        icon: Landmark,
        path: '/reports/accounting/balance-sheet',
      },
      {
        title: 'Libro de IVA',
        description: 'IVA soportado y repercutido para modelo 303.',
        icon: Receipt,
        path: '/reports/accounting/vat',
      },
    ],
  },
  management: {
    title: 'Informes de gestión',
    subtitle: 'Rentabilidad, aging, tesorería e informes para socios.',
    items: [
      {
        title: 'Rentabilidad por cliente',
        description: 'Facturación y margen aportado por cliente en el período.',
        icon: PieChart,
        path: '/reports/management/profit-customer',
      },
      {
        title: 'Rentabilidad por producto',
        description: 'Margen y rotación por artículo.',
        icon: Package,
        path: '/reports/management/profit-item',
      },
      {
        title: 'Rentabilidad por proyecto',
        description: 'Ingresos vs gastos por orden interna con desviación.',
        icon: Briefcase,
        path: '/reports/management/profit-project',
      },
      {
        title: 'Rentabilidad por centro de coste',
        description: 'Análisis por unidad de responsabilidad.',
        icon: Building2,
        path: '/reports/management/profit-cost-center',
      },
      {
        title: 'Informe ejecutivo',
        description: 'Resumen trimestral para socios/junta con KPIs y comparativas.',
        icon: FileBarChart,
        path: '/reports/management/executive',
      },
      {
        title: 'Aging de cobros',
        description: 'Facturas de venta pendientes por tramo de vencimiento.',
        icon: TrendingDown,
        path: '/reports/management/aging-receivables',
      },
      {
        title: 'Aging de pagos',
        description: 'Facturas de compra pendientes por tramo.',
        icon: Wallet,
        path: '/reports/management/aging-payables',
      },
      {
        title: 'Cash-flow',
        description: 'Cobros vs pagos reales y previstos.',
        icon: LineChartIcon,
        path: '/reports/management/cashflow',
      },
    ],
  },
  hr: {
    title: 'Informes RRHH',
    subtitle: 'Nóminas y coste laboral.',
    items: [
      {
        title: 'Recibo de nómina',
        description: 'PDF por empleado con devengos, deducciones y neto.',
        icon: Banknote,
        path: '/reports/hr/payslip',
      },
      {
        title: 'Costes laborales',
        description: 'Resumen bruto + SS empresa + IRPF del período.',
        icon: UserCheck,
        path: '/reports/hr/labor-cost',
      },
      {
        title: 'Plantilla actual',
        description: 'Listado de empleados con alta, baja, contrato y departamento.',
        icon: Users,
        path: '/reports/hr/headcount',
      },
    ],
  },
  stock: {
    title: 'Informes de stock',
    subtitle: 'Valoración, rotación y movimientos.',
    items: [
      {
        title: 'Valoración de inventario',
        description: 'Stock × precio medio por artículo.',
        icon: Warehouse,
        path: '/reports/stock/valuation',
      },
      {
        title: 'Rotación',
        description: 'Días de stock y rotación por artículo.',
        icon: RotateCw,
        path: '/reports/stock/rotation',
      },
      {
        title: 'Movimientos de stock',
        description: 'Entradas, salidas y ajustes por período.',
        icon: ArrowLeftRight,
        path: '/reports/stock/movements',
      },
    ],
  },
};

export const ReportsHub: React.FC<HubProps> = ({ category }) => {
  const cat = CATEGORIES[category];
  return (
    <div className="p-8 w-full space-y-6 animate-in fade-in duration-500">
      <PageHeader title={cat.title} subtitle={cat.subtitle} size="lg" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cat.items.map((item) => (
          <ReportCard key={item.path} {...item} />
        ))}
      </div>
    </div>
  );
};
