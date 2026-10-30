import React, { useMemo, useState } from 'react';
import { BottomNavigation, FloatingActionButton } from '@openfactu/ui';
import type { BottomNavigationItem, FloatingAction } from '@openfactu/ui';
import { LayoutDashboard, ScanLine, Search, ShoppingCart, Truck } from 'lucide-react';
import { useMobileNav } from '../../context/MobileNavContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { canRead, permissionPathFor } from '../../modules/permissions';
import { BarcodeCameraModal } from '../scanner/BarcodeCameraModal';
import { useModuleSubTabs } from './useModuleSubTabs';

/** Alto de la barra (80 px) que `FloatingActionButton` respeta para no taparla. */
const NAV_HEIGHT = '80px';

const DESTINATIONS = [
  { key: 'dashboard', label: 'Inicio', icon: <LayoutDashboard size={21} />, path: '/' },
  { key: 'sales', label: 'Ventas', icon: <ShoppingCart size={21} />, path: '/sales/invoices' },
  { key: 'purchases', label: 'Compras', icon: <Truck size={21} />, path: '/purchases/invoices' },
];

/** Pantallas donde tiene sentido escanear: artículos y documentos. */
const SCAN_PREFIXES = ['/sales', '/purchases', '/documents', '/items', '/inventory'];

/**
 * Navegación inferior, solo en móvil: `BottomNavigation` de @openfactu/ui con
 * tres accesos rápidos y «Más», que abre el menú completo (vía
 * `MobileNavContext`). Los accesos se filtran por permisos: quien no pueda ver
 * las facturas de venta no debe tener un botón que lo devuelva atrás.
 *
 * El escáner ya no ocupa el centro: es un `FloatingActionButton` que solo sale
 * donde hay códigos que leer, con «Escanear» y «Buscar».
 */
export const MobileBottomNav: React.FC = () => {
  const { toggle } = useMobileNav();
  const { openTab, tabs, activeTabId } = useTabs();
  const { user } = useAuth();
  const { active } = useModuleSubTabs();
  const activePath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const [scanOpen, setScanOpen] = useState(false);

  const items = useMemo<BottomNavigationItem[]>(
    () =>
      DESTINATIONS.filter(
        (d) => d.path === '/' || canRead(user, permissionPathFor(d.path) ?? d.path),
      ).map((d) => ({ key: d.key, label: d.label, icon: d.icon, onClick: () => openTab(d.path) })),
    [user, openTab],
  );
  const value = DESTINATIONS.find((d) => d.path === activePath)?.key;

  const canScan = active?.id === 'inventory' || SCAN_PREFIXES.some((p) => activePath.startsWith(p));
  const actions: FloatingAction[] = [
    {
      id: 'scan',
      label: 'Escanear código',
      icon: <ScanLine size={19} />,
      onClick: () => setScanOpen(true),
    },
    {
      id: 'search',
      label: 'Buscar',
      icon: <Search size={19} />,
      // El buscador global (Ctrl+K) escucha el teclado: se le pide que abra.
      onClick: () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })),
    },
  ];

  return (
    <>
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30">
        <BottomNavigation
          items={items}
          value={value}
          onOpenMenu={toggle}
          menuLabel="Más"
          ariaLabel="Navegación inferior"
        />
      </div>
      {canScan && (
        <FloatingActionButton
          className="md:hidden"
          actions={actions}
          label="Acciones rápidas"
          style={{ ['--k-mobile-navigation-height' as string]: NAV_HEIGHT }}
        />
      )}
      <BarcodeCameraModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </>
  );
};
