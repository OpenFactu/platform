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
import { useMobilePageActionsFor } from '../../context/MobilePageActionsContext';
import { useI18n } from '@/i18n/I18nContext';

/** Alto de la barra (80 px) que `FloatingActionButton` respeta para no taparla. */
const NAV_HEIGHT = '80px';

const DESTINATIONS = [
  { key: 'dashboard', label: 'app.bottomNav.home', icon: <LayoutDashboard size={21} />, path: '/' },
  {
    key: 'sales',
    label: 'app.bottomNav.sales',
    icon: <ShoppingCart size={21} />,
    path: '/sales/invoices',
  },
  {
    key: 'purchases',
    label: 'app.bottomNav.purchases',
    icon: <Truck size={21} />,
    path: '/purchases/invoices',
  },
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
 * donde hay códigos que leer, con «Escanear» y «Buscar». El mismo botón lleva
 * las acciones que la pantalla activa haya registrado (las de un documento:
 * asentar, PDF, enviar…; ver MobilePageActionsContext), debajo, junto al pulgar.
 */
export const MobileBottomNav: React.FC = () => {
  const { toggle } = useMobileNav();
  const { openTab, tabs, activeTabId } = useTabs();
  const { user } = useAuth();
  const { active } = useModuleSubTabs();
  const activePath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const [scanOpen, setScanOpen] = useState(false);
  const { t } = useI18n();

  const items = useMemo<BottomNavigationItem[]>(
    () =>
      DESTINATIONS.filter(
        (d) => d.path === '/' || canRead(user, permissionPathFor(d.path) ?? d.path),
      ).map((d) => ({
        key: d.key,
        label: t(d.label),
        icon: d.icon,
        onClick: () => openTab(d.path),
      })),
    [user, openTab, t],
  );
  const value = DESTINATIONS.find((d) => d.path === activePath)?.key;

  const canScan = active?.id === 'inventory' || SCAN_PREFIXES.some((p) => activePath.startsWith(p));
  const pageActions = useMobilePageActionsFor(activeTabId);
  const quickActions: FloatingAction[] = [
    {
      id: 'scan',
      label: t('app.bottomNav.scan'),
      icon: <ScanLine size={19} />,
      onClick: () => setScanOpen(true),
    },
    {
      id: 'search',
      label: t('app.bottomNav.search'),
      icon: <Search size={19} />,
      // El buscador global (Ctrl+K) escucha el teclado: se le pide que abra.
      onClick: () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })),
    },
  ];
  const actions = [...(canScan ? quickActions : []), ...pageActions];

  return (
    <>
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30">
        <BottomNavigation
          items={items}
          value={value}
          onOpenMenu={toggle}
          menuLabel={t('app.bottomNav.more')}
          ariaLabel={t('app.bottomNav.aria')}
        />
      </div>
      {actions.length > 0 && (
        <FloatingActionButton
          className="md:hidden"
          actions={actions}
          label={pageActions.length ? t('app.bottomNav.actions') : t('app.bottomNav.quickActions')}
          style={{ ['--k-mobile-navigation-height' as string]: NAV_HEIGHT }}
        />
      )}
      <BarcodeCameraModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </>
  );
};
