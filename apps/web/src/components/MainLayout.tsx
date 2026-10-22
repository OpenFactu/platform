import React, { lazy, Suspense } from 'react';
import { TabBar } from './tabs/TabBar';
import { TabsHost } from './tabs/TabsHost';
import { IconSidebar } from './layout/IconSidebar';
import { TopHeader } from './layout/TopHeader';
import { ModuleTabBar } from './layout/ModuleTabBar';
import { MobileBottomNav } from './layout/MobileBottomNav';
import { PageLoading } from './PageLoading';
import { ImportProgressWatcher } from '@/modules/data-import/components/ImportProgressWatcher';
import { useAuth } from '../context/AuthContext';

const DriverLayout = lazy(() =>
  import('@/modules/logistics/components/DriverLayout').then((m) => ({ default: m.DriverLayout })),
);

/**
 * Layout principal. Si el usuario tiene rol `DRIVER`, se pinta la
 * versión simplificada mobile-first sin sidebar ni topbar.
 */
export const MainLayout: React.FC = () => {
  const { user } = useAuth();

  if (user?.role === 'DRIVER') {
    return (
      <Suspense fallback={<PageLoading />}>
        <DriverLayout />
      </Suspense>
    );
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
      {/* Sigue las importaciones en curso y las pinta en un aviso con barra de
          progreso. Va aquí y no en su pantalla: una carga de miles de filas
          tarda, y quien la lanza se va a trabajar a otro sitio. */}
      <ImportProgressWatcher />
    </div>
  );
};
