import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@openfactu/ui';
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
  color: string;
  bg: string;
}

const ReportCard: React.FC<ReportCardProps> = ({
  title,
  description,
  icon: Icon,
  path,
  color,
  bg,
}) => {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(path)}
      className="group text-left p-5 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-500/50 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`p-2.5 rounded-lg ${bg} ${color} shrink-0`}>
          <Icon size={18} />
        </div>
        <ChevronRight
          size={16}
          className="text-slate-300 dark:text-slate-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all"
        />
      </div>
      <h3 className="mt-3 font-black text-slate-900 dark:text-slate-100 text-sm tracking-tight">
        {title}
      </h3>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
        {description}
      </p>
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
        color: 'text-blue-600 dark:text-blue-300',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
      },
      {
        title: 'Libro mayor',
        description: 'Movimientos de una cuenta con saldo corriente.',
        icon: BookOpenCheck,
        path: '/reports/accounting/ledger',
        color: 'text-indigo-600 dark:text-indigo-300',
        bg: 'bg-indigo-50 dark:bg-indigo-500/10',
      },
      {
        title: 'Balance sumas y saldos',
        description: 'Totales debe/haber y saldo por cuenta del período.',
        icon: Scale,
        path: '/reports/accounting/trial-balance',
        color: 'text-teal-600 dark:text-teal-300',
        bg: 'bg-teal-50 dark:bg-teal-500/10',
      },
      {
        title: 'Cuenta de P&L',
        description: 'Ingresos menos gastos = resultado del ejercicio.',
        icon: TrendingUp,
        path: '/reports/accounting/pl',
        color: 'text-emerald-600 dark:text-emerald-300',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      },
      {
        title: 'Balance de situación',
        description: 'Activo = Pasivo + Patrimonio a una fecha.',
        icon: Landmark,
        path: '/reports/accounting/balance-sheet',
        color: 'text-purple-600 dark:text-purple-300',
        bg: 'bg-purple-50 dark:bg-purple-500/10',
      },
      {
        title: 'Libro de IVA',
        description: 'IVA soportado y repercutido para modelo 303.',
        icon: Receipt,
        path: '/reports/accounting/vat',
        color: 'text-amber-600 dark:text-amber-300',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
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
        color: 'text-emerald-600 dark:text-emerald-300',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      },
      {
        title: 'Rentabilidad por producto',
        description: 'Margen y rotación por artículo.',
        icon: Package,
        path: '/reports/management/profit-item',
        color: 'text-blue-600 dark:text-blue-300',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
      },
      {
        title: 'Rentabilidad por proyecto',
        description: 'Ingresos vs gastos por orden interna con desviación.',
        icon: Briefcase,
        path: '/reports/management/profit-project',
        color: 'text-indigo-600 dark:text-indigo-300',
        bg: 'bg-indigo-50 dark:bg-indigo-500/10',
      },
      {
        title: 'Rentabilidad por centro de coste',
        description: 'Análisis por unidad de responsabilidad.',
        icon: Building2,
        path: '/reports/management/profit-cost-center',
        color: 'text-teal-600 dark:text-teal-300',
        bg: 'bg-teal-50 dark:bg-teal-500/10',
      },
      {
        title: 'Informe ejecutivo',
        description: 'Resumen trimestral para socios/junta con KPIs y comparativas.',
        icon: FileBarChart,
        path: '/reports/management/executive',
        color: 'text-rose-600 dark:text-rose-300',
        bg: 'bg-rose-50 dark:bg-rose-500/10',
      },
      {
        title: 'Aging de cobros',
        description: 'Facturas de venta pendientes por tramo de vencimiento.',
        icon: TrendingDown,
        path: '/reports/management/aging-receivables',
        color: 'text-amber-600 dark:text-amber-300',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
      },
      {
        title: 'Aging de pagos',
        description: 'Facturas de compra pendientes por tramo.',
        icon: Wallet,
        path: '/reports/management/aging-payables',
        color: 'text-orange-600 dark:text-orange-300',
        bg: 'bg-orange-50 dark:bg-orange-500/10',
      },
      {
        title: 'Cash-flow',
        description: 'Cobros vs pagos reales y previstos.',
        icon: LineChartIcon,
        path: '/reports/management/cashflow',
        color: 'text-cyan-600 dark:text-cyan-300',
        bg: 'bg-cyan-50 dark:bg-cyan-500/10',
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
        color: 'text-emerald-600 dark:text-emerald-300',
        bg: 'bg-emerald-50 dark:bg-emerald-500/10',
      },
      {
        title: 'Costes laborales',
        description: 'Resumen bruto + SS empresa + IRPF del período.',
        icon: UserCheck,
        path: '/reports/hr/labor-cost',
        color: 'text-blue-600 dark:text-blue-300',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
      },
      {
        title: 'Plantilla actual',
        description: 'Listado de empleados con alta, baja, contrato y departamento.',
        icon: Users,
        path: '/reports/hr/headcount',
        color: 'text-indigo-600 dark:text-indigo-300',
        bg: 'bg-indigo-50 dark:bg-indigo-500/10',
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
        color: 'text-teal-600 dark:text-teal-300',
        bg: 'bg-teal-50 dark:bg-teal-500/10',
      },
      {
        title: 'Rotación',
        description: 'Días de stock y rotación por artículo.',
        icon: RotateCw,
        path: '/reports/stock/rotation',
        color: 'text-blue-600 dark:text-blue-300',
        bg: 'bg-blue-50 dark:bg-blue-500/10',
      },
      {
        title: 'Movimientos de stock',
        description: 'Entradas, salidas y ajustes por período.',
        icon: ArrowLeftRight,
        path: '/reports/stock/movements',
        color: 'text-amber-600 dark:text-amber-300',
        bg: 'bg-amber-50 dark:bg-amber-500/10',
      },
    ],
  },
};

export const ReportsHub: React.FC<HubProps> = ({ category }) => {
  const cat = CATEGORIES[category];
  return (
    <div className="p-8 w-full space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          {cat.title}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">{cat.subtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cat.items.map((item) => (
          <ReportCard key={item.path} {...item} />
        ))}
      </div>
    </div>
  );
};
