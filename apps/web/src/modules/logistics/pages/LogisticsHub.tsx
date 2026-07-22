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
import { ShipmentsTab } from './ShipmentsTab';
import { RoutesTab } from './RoutesTab';
import { PackagesTab } from './PackagesTab';
import { StagingAreasTab } from './StagingAreasTab';
import { VehiclesTab } from './VehiclesTab';
import { PreparationTab } from './PreparationTab';
import { PlatformsTab } from './PlatformsTab';
import { IncidentsTab } from './IncidentsTab';

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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'preparation', label: 'Preparación', icon: <ClipboardCheck size={14} /> },
    { id: 'shipments', label: 'Envíos', icon: <Truck size={14} /> },
    { id: 'incidents', label: 'Incidencias', icon: <AlertTriangle size={14} /> },
    { id: 'routes', label: 'Rutas', icon: <MapPin size={14} /> },
    { id: 'vehicles', label: 'Vehículos', icon: <Truck size={14} /> },
    { id: 'packages', label: 'Paquetes', icon: <PackageIcon size={14} /> },
    { id: 'staging', label: 'Acopios', icon: <Warehouse size={14} /> },
    { id: 'platforms', label: 'Plataformas', icon: <Building2 size={14} /> },
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

      {/* Tabs — scroll horizontal cuando no caben, sin wrap (patrón CompanySettings). */}
      <div className="border-b border-line dark:border-ink-700 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors shrink-0 ${
                tab === t.id
                  ? 'text-accent border-accent'
                  : 'text-ink-500 dark:text-ink-400 border-transparent hover:text-accent dark:hover:text-accent'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
