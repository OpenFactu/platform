import React, { useState } from 'react';
import { LayoutDashboard, ShoppingCart, Truck, Menu, ScanLine } from 'lucide-react';
import { cn } from '@openfactu/ui';
import { useMobileNav } from '../../context/MobileNavContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { canRead, permissionPathFor } from '../../modules/permissions';
import { BarcodeCameraModal } from '../scanner/BarcodeCameraModal';
import { useModuleSubTabs } from './useModuleSubTabs';

interface SlotDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  path?: string;
  action?: 'menu';
}

const SLOTS: SlotDef[] = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, path: '/' },
  { id: 'sales', label: 'Ventas', icon: ShoppingCart, path: '/sales/invoices' },
  { id: 'purchases', label: 'Compras', icon: Truck, path: '/purchases/invoices' },
  { id: 'menu', label: 'Más', icon: Menu, action: 'menu' },
];

/**
 * Barra inferior fija, sólo en móvil, con 4 accesos rápidos. "Más" abre el
 * drawer con el `IconSidebar` completo (vía `MobileNavContext`). El escáner ya
 * no ocupa el centro: es un botón flotante que solo sale en inventario y
 * documentos. Respeta safe-area-inset-bottom para iPhone con home bar.
 */
export const MobileBottomNav: React.FC = () => {
  const { toggle } = useMobileNav();
  const { openTab, tabs, activeTabId } = useTabs();
  const { user } = useAuth();
  const activePath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const [scanOpen, setScanOpen] = useState(false);
  const { active } = useModuleSubTabs();
  const canScan =
    active?.id === 'inventory' || /^\/(sales|purchases|documents)(\/|$)/.test(activePath);

  const handleSlot = (s: SlotDef) => {
    if (s.action === 'menu') toggle();
    else if (s.path) openTab(s.path);
  };

  /**
   * Estos accesos van a rutas fijas, así que hay que comprobarlas: quien no
   * pueda ver las facturas de venta no debe tener un botón que le lleve a que
   * lo echen de vuelta. El de inicio y el del menú siempre están.
   */
  const renderSlot = (s: SlotDef) => {
    const Icon = s.icon;
    const isActive = s.path && s.path === activePath;
    if (s.path && !canRead(user, permissionPathFor(s.path) ?? s.path)) {
      // Hueco vacío para no descolocar el botón central del escáner.
      return <div key={s.id} className="flex-1" aria-hidden />;
    }
    return (
      <button
        key={s.id}
        onClick={() => handleSlot(s)}
        className={cn(
          'flex-1 flex flex-col items-center justify-center gap-1 py-2 transition-colors',
          isActive ? 'text-accent' : 'text-fg-muted hover:text-accent',
        )}
        aria-label={s.label}
      >
        <Icon size={20} />
        <span className="text-[10px] font-bold tracking-wider uppercase">{s.label}</span>
      </button>
    );
  };

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-bg-card border-t border-border-default"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Navegación inferior"
      >
        <div className="relative flex items-stretch h-16">
          {renderSlot(SLOTS[0])}
          {renderSlot(SLOTS[1])}
          {renderSlot(SLOTS[2])}
          {renderSlot(SLOTS[3])}
        </div>
      </nav>
      {/* El escáner solo sirve donde hay códigos de artículos o documentos: ahí
          aparece como botón flotante; en el resto de pantallas no ocupa sitio. */}
      {canScan && (
        <button
          onClick={() => setScanOpen(true)}
          aria-label="Escanear código de barras"
          className="md:hidden fixed right-4 bottom-20 z-30 w-12 h-12 rounded-full bg-accent text-accent-fg flex items-center justify-center shadow-lg active:scale-95 transition-transform"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <ScanLine size={22} />
        </button>
      )}
      <BarcodeCameraModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </>
  );
};
