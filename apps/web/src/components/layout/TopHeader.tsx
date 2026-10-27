import React from 'react';
import { ArrowLeft, Boxes, Menu } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useMobileNav } from '../../context/MobileNavContext';
import { useTabs } from '../../context/TabsContext';
import { GlobalSearch } from '../GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { MobileModuleSwitcher } from './MobileModuleSwitcher';

/**
 * Header superior compacto: logo + branding, búsqueda global y notificaciones. El modo claro/oscuro se cambia en
 * Ajustes → Empresa → Branding; el idioma ya no tiene botón aquí.
 *
 * El tenant switcher y el menú de usuario ahora viven en el IconSidebar (al pie).
 */
export const TopHeader: React.FC = () => {
  const { branding } = useTheme();
  const { toggle: toggleMobileNav } = useMobileNav();
  const { tabs, activeTabId, closeTab } = useTabs();

  return (
    <header className="h-14 bg-bg-card border-b border-border-default flex items-center px-3 md:px-4 gap-2 md:gap-4 z-10">
      {/* Hamburguesa (también en desktop: abre el drawer con etiquetas) */}
      <button
        onClick={toggleMobileNav}
        className="p-2 rounded-xs text-fg-muted hover:text-accent dark:hover:text-accent hover:bg-bg-hover transition-colors"
        aria-label="Abrir menú"
      >
        <Menu size={20} />
      </button>

      {/* Móvil: volver a la pantalla anterior (la barra de pestañas no se ve) */}
      {tabs.length > 1 && (
        <button
          onClick={() => activeTabId && closeTab(activeTabId)}
          className="md:hidden p-2 -ml-1 rounded-xs text-fg-muted hover:text-accent hover:bg-bg-hover transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft size={20} />
        </button>
      )}

      {/* Móvil: módulo y sección actual; al pulsar, cambia de sección */}
      <div className="md:hidden flex-1 min-w-0">
        <MobileModuleSwitcher fallbackLabel={branding.appName} />
      </div>

      {/* Logo + nombre */}
      <div className="hidden md:flex items-center gap-2 mr-4 shrink-0">
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt={branding.appName}
            className="w-7 h-7 rounded-xs object-cover"
          />
        ) : (
          <div className="w-7 h-7 bg-primary rounded-xs flex items-center justify-center">
            <Boxes className="text-primary-fg" size={16} />
          </div>
        )}
        <span className="hidden sm:inline text-sm font-bold text-fg-default tracking-tight">
          {branding.appName}
        </span>
      </div>

      {/*
        Búsqueda global.

        `min-w-0` no es decorativo: un hijo de un flex tiene `min-width: auto`,
        así que se niega a encogerse por debajo del ancho de su contenido — y
        aquí el contenido es un texto largo ("Buscar interlocutores, artículos
        o documentos…"). Sin esto, al estrechar la ventana la caja no cede y
        empuja fuera del header las notificaciones.
      */}
      <div className="md:flex-1 min-w-0 md:max-w-xl max-md:ml-auto">
        <GlobalSearch />
      </div>

      {/* Controles al final del header, agrupados. `shrink-0` para que sea la
          búsqueda la que ceda ancho y no estos, que son iconos y no admiten
          recorte. */}
      <div className="flex items-center gap-0.5 ml-auto shrink-0">
        <NotificationBell />
      </div>
    </header>
  );
};
