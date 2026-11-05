import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  MapPin,
  Package as PackageIcon,
  Truck,
} from 'lucide-react';
import { PageHeader, Tabs } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { IncidentsTab } from '../components/IncidentsTab';
import { PackagesTab } from '../components/PackagesTab';
import { PreparationTab } from '../components/PreparationTab';
import { ReportsTab } from '../components/ReportsTab';
import { RoutesTab } from '../components/RoutesTab';
import { ShipmentsTab } from '../components/ShipmentsTab';
import { TodayTab } from '../components/TodayTab';

type OperationTab =
  | 'today'
  | 'preparation'
  | 'shipments'
  | 'routes'
  | 'packages'
  | 'incidents'
  | 'reports';

/** El día a día de la logística. Lo que se configura una vez está en su propio submenú. */
export const LogisticsHub: React.FC = () => {
  const { t } = useI18n();
  const [operation, setOperation] = useState<OperationTab>('today');

  const operationTabs: { key: OperationTab; label: string; icon: React.ReactNode }[] = [
    { key: 'today', label: t('logistics.hub.tabs.today'), icon: <CalendarCheck size={14} /> },
    {
      key: 'preparation',
      label: t('logistics.hub.tabs.preparation'),
      icon: <ClipboardCheck size={14} />,
    },
    { key: 'shipments', label: t('logistics.hub.tabs.shipments'), icon: <Truck size={14} /> },
    { key: 'routes', label: t('logistics.hub.tabs.routes'), icon: <MapPin size={14} /> },
    { key: 'packages', label: t('logistics.hub.tabs.packages'), icon: <PackageIcon size={14} /> },
    {
      key: 'incidents',
      label: t('logistics.hub.tabs.incidents'),
      icon: <AlertTriangle size={14} />,
    },
    { key: 'reports', label: t('logistics.hub.tabs.reports'), icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('logistics.hub.title')}
        subtitle={t('logistics.hub.subtitle')}
        icon={<Truck size={18} />}
        size="sm"
        tabs={
          <Tabs
            items={operationTabs}
            value={operation}
            onChange={(key) => setOperation(key as OperationTab)}
            scrollable
          />
        }
      />

      {operation === 'today' && <TodayTab onOpenSection={setOperation} />}
      {operation === 'preparation' && <PreparationTab />}
      {operation === 'shipments' && <ShipmentsTab />}
      {operation === 'routes' && <RoutesTab />}
      {operation === 'packages' && <PackagesTab />}
      {operation === 'incidents' && <IncidentsTab />}
      {operation === 'reports' && <ReportsTab />}
    </div>
  );
};

export default LogisticsHub;
