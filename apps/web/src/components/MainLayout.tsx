import React from 'react';
import { TabBar } from './tabs/TabBar';
import { TabsHost } from './tabs/TabsHost';
import { IconSidebar } from './layout/IconSidebar';
import { TopHeader } from './layout/TopHeader';
import { ModuleTabBar } from './layout/ModuleTabBar';
import { MobileBottomNav } from './layout/MobileBottomNav';
import { DriverLayout } from '@/modules/logistics/components/DriverLayout';
import { useAuth } from '../context/AuthContext';

/**
 * Layout principal. Si el usuario tiene rol `DRIVER`, se pinta la
 * versión simplificada mobile-first sin sidebar ni topbar.
 */
export const MainLayout: React.FC = () => {
  const { user } = useAuth();

  if (user?.role === 'DRIVER') {
    return <DriverLayout />;
  }

  // bg-bg-app y no bg-slate-*: es el fondo del shell y tiene que seguir al tema del
  // tenant. Con la paleta fija de Tailwind se quedaba gris pizarra aunque la
  // empresa usara Forest, Plum o Carbon.
  return (
    <div className="flex h-screen bg-bg-app">
      <IconSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader />
        <ModuleTabBar />
        <TabBar />
        <main className="flex-1 flex flex-col bg-bg-app min-h-0 pb-16 md:pb-0">
          <TabsHost />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
};
