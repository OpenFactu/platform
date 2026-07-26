import React, { useState } from 'react';
import {
  Truck,
  MapPin,
  Package as PackageIcon,
  Warehouse,
  ClipboardCheck,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { Tabs } from '@openfactu/ui';
import { ShipmentsTab } from '../components/ShipmentsTab';
import { RoutesTab } from '../components/RoutesTab';
import { PackagesTab } from '../components/PackagesTab';
import { StagingAreasTab } from '../components/StagingAreasTab';
import { VehiclesTab } from '../components/VehiclesTab';
import { PreparationTab } from '../components/PreparationTab';
import { PlatformsTab } from '../components/PlatformsTab';
import { IncidentsTab } from '../components/IncidentsTab';

type Tab =
  | 'shipments'
  | 'preparation'
  | 'incidents'
  | 'routes'
  | 'vehicles'
  | 'packages'
  | 'staging'
  | 'platforms';

export const LogisticsHub: React.FC = () => {
  const [tab, setTab] = useState<Tab>('preparation');

  // Fuente de verdad de las pestañas: `Tabs` deriva sus items de aquí.
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'preparation', label: 'Preparación', icon: <ClipboardCheck size={14} /> },
    { key: 'shipments', label: 'Envíos', icon: <Truck size={14} /> },
    { key: 'incidents', label: 'Incidencias', icon: <AlertTriangle size={14} /> },
    { key: 'routes', label: 'Rutas', icon: <MapPin size={14} /> },
    { key: 'vehicles', label: 'Vehículos', icon: <Truck size={14} /> },
    { key: 'packages', label: 'Paquetes', icon: <PackageIcon size={14} /> },
    { key: 'staging', label: 'Acopios', icon: <Warehouse size={14} /> },
    { key: 'platforms', label: 'Plataformas', icon: <Building2 size={14} /> },
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <Truck className="text-blue-600 dark:text-blue-300" size={22} />
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Centro logístico
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Envíos, rutas, paquetes y acopios con seguimiento en tiempo real.
            </p>
          </div>
        </div>
      </header>

      {/* Scroll horizontal cuando no caben, sin wrap (patrón CompanySettings). */}
      <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as Tab)} scrollable />

      {tab === 'preparation' && <PreparationTab />}
      {tab === 'shipments' && <ShipmentsTab />}
      {tab === 'incidents' && <IncidentsTab />}
      {tab === 'routes' && <RoutesTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'packages' && <PackagesTab />}
      {tab === 'staging' && <StagingAreasTab />}
      {tab === 'platforms' && <PlatformsTab />}
    </div>
  );
};

export default LogisticsHub;
