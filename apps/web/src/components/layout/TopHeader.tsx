import React from 'react';
import { Boxes, Sun, Moon, Menu, Globe } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useMobileNav } from '../../context/MobileNavContext';
import { useI18n } from '../../i18n/I18nContext';
import { GlobalSearch } from '../GlobalSearch';
import { NotificationBell } from './NotificationBell';

/**
 * Header superior compacto: logo + branding, búsqueda global, toggle tema.
 *
 * El tenant switcher y el menú de usuario ahora viven en el IconSidebar (al pie).
 */
export const TopHeader: React.FC = () => {
  const { branding, update } = useTheme();
  const { toggle: toggleMobileNav } = useMobileNav();
  const isDark = branding.themeMode === 'dark';
  const toggleTheme = () => update('branding', { themeMode: isDark ? 'light' : 'dark' });

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

      {/* Logo + nombre */}
      <div className="flex items-center gap-2 mr-2 md:mr-4 shrink-0">
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
        empuja fuera del header el idioma y el cambio de tema.
      */}
      <div className="flex-1 min-w-0 max-w-xl">
        <GlobalSearch />
      </div>

      {/* Controles al final del header, agrupados. `shrink-0` para que sea la
          búsqueda la que ceda ancho y no estos, que son iconos y no admiten
          recorte. */}
      <div className="flex items-center gap-0.5 ml-auto shrink-0">
        <NotificationBell />
        <LocaleToggle />
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xs text-fg-muted hover:bg-bg-hover hover:text-accent dark:hover:text-accent transition-colors"
          aria-label="Cambiar tema"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
};

/** Botón compacto que cicla ES → EN → ES. */
const LocaleToggle: React.FC = () => {
  const { locale, setLocale } = useI18n();
  const next = locale === 'es' ? 'en' : 'es';
  return (
    <button
      onClick={() => setLocale(next)}
      className="flex items-center gap-1 px-2 py-2 rounded-xs text-fg-muted hover:bg-bg-hover hover:text-accent dark:hover:text-accent transition-colors"
      aria-label={`Idioma: ${locale.toUpperCase()}`}
      title={`Idioma: ${locale.toUpperCase()}`}
    >
      <Globe size={14} />
      <span className="text-[10px] font-bold uppercase tracking-wider">{locale}</span>
    </button>
  );
};
