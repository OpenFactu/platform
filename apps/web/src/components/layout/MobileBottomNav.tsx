import React, { useState } from 'react';
import { LayoutDashboard, ShoppingCart, Truck, Menu, ScanLine } from 'lucide-react';
import { cn } from '@openfactu/ui';
import { useMobileNav } from '../../context/MobileNavContext';
import { useTabs } from '../../context/TabsContext';
import { BarcodeCameraModal } from '../scanner/BarcodeCameraModal';

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
  // slot central (scan) se inserta aparte para destacarlo
  { id: 'purchases', label: 'Compras', icon: Truck, path: '/purchases/invoices' },
  { id: 'menu', label: 'Menú', icon: Menu, action: 'menu' },
];

/**
 * Barra inferior fija, sólo en móvil. 4 accesos rápidos + botón central
 * destacado (teal, elevado) para escanear. El slot "Menú" abre el drawer
 * con el `IconSidebar` completo (vía `MobileNavContext`). Respeta
 * safe-area-inset-bottom para iPhone con home bar.
 */
export const MobileBottomNav: React.FC = () => {
  const { toggle } = useMobileNav();
  const { openTab, tabs, activeTabId } = useTabs();
  const activePath = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const [scanOpen, setScanOpen] = useState(false);

  const handleSlot = (s: SlotDef) => {
    if (s.action === 'menu') toggle();
    else if (s.path) openTab(s.path);
  };

  const renderSlot = (s: SlotDef) => {
    const Icon = s.icon;
    const isActive = s.path && s.path === activePath;
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
          {/* Slot central — escáner */}
          <div className="flex-1 flex items-start justify-center relative">
            <button
              onClick={() => setScanOpen(true)}
              aria-label="Escanear código de barras"
              className="absolute -top-5 w-14 h-14 rounded-full bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/40 border-4 border-bg-card active:scale-95 transition-transform"
            >
              <ScanLine size={24} />
            </button>
          </div>
          {renderSlot(SLOTS[2])}
          {renderSlot(SLOTS[3])}
        </div>
      </nav>
      <BarcodeCameraModal open={scanOpen} onClose={() => setScanOpen(false)} />
    </>
  );
};
