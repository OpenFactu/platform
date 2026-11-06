import React, { useState } from 'react';
import {
  Building2,
  MessageSquareWarning,
  Settings,
  SlidersHorizontal,
  Truck,
  Warehouse,
} from 'lucide-react';
import { PageHeader, Tabs } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { AppReportsTab } from '../components/AppReportsTab';
import { DeliveryFlowTab } from '../components/DeliveryFlowTab';
import { PlatformsTab } from '../components/PlatformsTab';
import { StagingAreasTab } from '../components/StagingAreasTab';
import { VehiclesTab } from '../components/VehiclesTab';

type SettingsTab = 'flow' | 'vehicles' | 'staging' | 'platforms' | 'appReports';

/** Lo que se configura una vez: quien prepara o reparte no tiene por qué pasar por aquí. */
export const LogisticsSettings: React.FC = () => {
  const { t } = useI18n();
  const [tab, setTab] = useState<SettingsTab>('flow');

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: 'flow', label: t('logistics.hub.tabs.flow'), icon: <SlidersHorizontal size={14} /> },
    { key: 'vehicles', label: t('logistics.hub.tabs.vehicles'), icon: <Truck size={14} /> },
    { key: 'staging', label: t('logistics.hub.tabs.staging'), icon: <Warehouse size={14} /> },
    { key: 'platforms', label: t('logistics.hub.tabs.platforms'), icon: <Building2 size={14} /> },
    {
      key: 'appReports',
      label: t('logistics.hub.tabs.appReports'),
      icon: <MessageSquareWarning size={14} />,
    },
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={t('logistics.settingsPage.title')}
        subtitle={t('logistics.settingsPage.subtitle')}
        icon={<Settings size={18} />}
        size="sm"
        tabs={
          <Tabs
            items={tabs}
            value={tab}
            onChange={(key) => setTab(key as SettingsTab)}
            scrollable
          />
        }
      />

      {tab === 'flow' && <DeliveryFlowTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'staging' && <StagingAreasTab />}
      {tab === 'platforms' && <PlatformsTab />}
      {tab === 'appReports' && <AppReportsTab />}
    </div>
  );
};

export default LogisticsSettings;
