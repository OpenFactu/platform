import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LogOut, Building2, X, ChevronDown, Search } from 'lucide-react';
import { cn } from '@openfactu/ui';
import { useModules, useActiveModule } from '../../context/PluginContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { useMobileNav } from '../../context/MobileNavContext';
import { useTheme } from '../../context/ThemeContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { PluginIcon } from '../PluginIcon';
import { TenantSwitcher } from '../TenantSwitcher';
import type { Module } from '../../modules/registry';

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  alpha: {
    label: 'Alpha',
    className: 'text-purple-700 dark:text-purple-300 bg-purple-500/10 border border-purple-500/30',
  },
  beta: {
    label: 'Beta',
    className: 'text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/30',
  },
  dev: {
    label: 'Dev',
    className: 'text-rose-700 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30',
  },
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || !STATUS_BADGE[status]) return null;
  const b = STATUS_BADGE[status];
  return (
    <span
      className={cn(
        'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs whitespace-nowrap',
        b.className,
      )}
    >
      {b.label}
    </span>
  );
};

/**
 * Sidebar de navegación.
 *
 * - **Desktop (≥ md)**: barra vertical de 60 px con iconos + tooltips.
 * - **Móvil (< md)**: panel a pantalla completa que desliza desde la izquierda,
 *   con lista de módulos (icono + label) + tenant switcher + menú de usuario
 *   en línea. Se controla desde `MobileNavContext`.
 */
export const IconSidebar: React.FC = () => {
  const allModules = useModules();
  const { openTab, tabs, activeTabId } = useTabs();
  const pathname = tabs.find((t) => t.id === activeTabId)?.path?.split('?')[0] || '/';
  const active = useActiveModule(pathname);
  const { user, logout } = useAuth();
  const { flags } = useTheme();
  const modules = (() => {
    if (user?.role === 'DRIVER') {
      // Sidebar simplificado para conductores: solo su app.
      return [
        {
          id: 'driver',
          label: 'Mi ruta',
          icon: 'Navigation',
          subTabs: [{ id: 'driver-home', label: 'Mi ruta', path: '/driver' }],
        } as Module,
      ];
    }
    const logisticsOnly = !!(flags as any).logisticsOnly;
    return allModules.filter((m) => {
      if (m.superuserOnly && user?.role !== 'SUPERUSER') return false;
      if (m.featureFlag && !(flags as any)[m.featureFlag]) return false;
      // Modo "sólo logística": ocultamos los módulos marcados como no-logísticos.
      if (logisticsOnly && (m as any).hiddenInLogisticsOnly) return false;
      return true;
    });
  })();

  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setVersion(d?.version || null))
      .catch(() => setVersion(null));
  }, []);

  const [tenantOpen, setTenantOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const tenantRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const { open: mobileOpen, setOpen: setMobileOpen } = useMobileNav();

  // Buscador del drawer.
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mobileOpen) {
      setQuery('');
      // Autofocus al abrir (sólo desktop, en móvil el teclado virtual molesta).
      if (!isMobile) setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [mobileOpen, isMobile]);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  // Sinónimos / palabras coloquiales → término real del menú.
  const SYNONYMS: Record<string, string> = {
    horario: 'turnos planificación plantilla',
    horarios: 'turnos planificación plantilla',
    fichaje: 'timeclock kiosko',
    fichajes: 'timeclock kiosko',
    gang: 'gantt',
    cronograma: 'gantt',
    proyecto: 'tareas gantt internal',
    iva: 'impuestos',
    cliente: 'interlocutores partners',
    proveedor: 'interlocutores partners',
    factura: 'facturas',
    albaran: 'albaranes',
    pedido: 'pedidos',
  };
  const searchResults = useMemo(() => {
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const raw = query.trim();
    if (!raw) return [];
    const expanded = raw
      .split(/\s+/)
      .map((w) => SYNONYMS[norm(w)] || w)
      .join(' ');
    const tokens = norm(expanded).split(/\s+/).filter(Boolean);
    const out: {
      modLabel: string;
      modIcon: string;
      sub: any;
      disabled: boolean;
      reason?: string;
    }[] = [];
    for (const mod of allModules) {
      // Saltamos sólo los de SUPERUSER si el user no lo es.
      if (mod.superuserOnly && user?.role !== 'SUPERUSER') continue;
      for (const sub of mod.subTabs as any[]) {
        if (!isAdmin && sub.adminOnly) continue;
        const hay = norm(`${mod.label} ${sub.label} ${sub.group || ''} ${sub.id}`);
        if (!tokens.every((t) => hay.includes(t))) continue;
        const flagOff = sub.featureFlag && !(flags as any)[sub.featureFlag];
        const modOff = mod.featureFlag && !(flags as any)[mod.featureFlag];
        out.push({
          modLabel: mod.label,
          modIcon: mod.icon,
          sub,
          disabled: !!(flagOff || modOff),
          reason: flagOff
            ? `Activa "${sub.featureFlag}" en Ajustes`
            : modOff
              ? `Activa "${mod.featureFlag}" en Ajustes`
              : undefined,
        });
      }
    }
    return out.slice(0, 30);
  }, [query, allModules, flags, isAdmin, user]);

  // Cerrar popovers al click fuera (sólo desktop, en móvil son secciones inline)
  useEffect(() => {
    if (isMobile) return;
    const onClick = (e: MouseEvent) => {
      if (tenantRef.current && !tenantRef.current.contains(e.target as Node)) setTenantOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isMobile]);

  const handleClick = (modId: string) => {
    const mod = modules.find((m) => m.id === modId);
    if (!mod || mod.subTabs.length === 0) return;
    // Siempre cerramos el drawer al navegar (también en desktop)
    setMobileOpen(false);
    openTab(mod.subTabs[0].path);
  };

  // ───────────── DRAWER (común móvil + desktop al pulsar hamburguesa) ─────────────
  const renderDrawer = () => (
    <>
      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 animate-in fade-in duration-200"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      {/* Panel: full-width en móvil, 360px en desktop */}
      <aside
        className={cn(
          'fixed top-0 left-0 bottom-0 z-40 flex flex-col bg-white dark:bg-ink-900',
          'w-full md:w-[360px] md:border-r md:border-line md:dark:border-ink-700 md:shadow-2xl',
          'transition-transform duration-250 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        aria-hidden={!mobileOpen}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-line dark:border-ink-700">
          <span className="font-display text-lg font-bold text-ink-900 dark:text-slate-100">
            Menú
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-xs text-ink-500 dark:text-ink-400 hover:text-accent hover:bg-line-2 dark:hover:bg-ink-700 transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={22} />
          </button>
        </div>

        {/* Buscador */}
        <div className="px-3 py-2 border-b border-line dark:border-ink-700">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 dark:text-ink-500 pointer-events-none"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  if (query) setQuery('');
                  else setMobileOpen(false);
                }
                if (e.key === 'Enter' && searchResults.length > 0) {
                  setMobileOpen(false);
                  openTab(searchResults[0].sub.path);
                }
              }}
              placeholder="Buscar en el menú…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xs bg-line-2/60 dark:bg-ink-800 border border-line dark:border-ink-700 text-ink-900 dark:text-slate-100 placeholder:text-ink-400 dark:placeholder:text-ink-500 focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Resultados de búsqueda o lista de módulos */}
        <nav className="flex-1 overflow-y-auto py-2">
          {query.trim() ? (
            searchResults.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-500 dark:text-ink-400">
                Sin resultados para “{query}”.
              </p>
            ) : (
              searchResults.map(({ modLabel, modIcon, sub, disabled, reason }) => {
                const subActive = sub.path === pathname;
                return (
                  <button
                    key={`${modLabel}-${sub.id}`}
                    onClick={() => {
                      setMobileOpen(false);
                      if (disabled) {
                        openTab('/settings/company');
                      } else {
                        openTab(sub.path);
                      }
                    }}
                    title={disabled ? reason : undefined}
                    className={cn(
                      'w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors',
                      subActive
                        ? 'bg-accent/10 text-accent'
                        : disabled
                          ? 'text-ink-400 dark:text-ink-500 hover:bg-line-2 dark:hover:bg-ink-700'
                          : 'text-ink-700 dark:text-slate-200 hover:bg-line-2 dark:hover:bg-ink-700',
                    )}
                  >
                    <PluginIcon iconName={modIcon} size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{sub.label}</p>
                      <p className="text-[11px] text-ink-500 dark:text-ink-400 truncate">
                        {modLabel}
                        {sub.group ? ` · ${sub.group}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={sub.status} />
                    {disabled && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-xs whitespace-nowrap">
                        Inactivo
                      </span>
                    )}
                  </button>
                );
              })
            )
          ) : (
            modules.map((mod) => (
              <MobileModuleAccordion
                key={mod.id}
                mod={mod}
                isActive={active?.id === mod.id}
                currentPath={pathname}
                onNavigate={(path) => {
                  setMobileOpen(false);
                  openTab(path);
                }}
              />
            ))
          )}
        </nav>

        {/* Tenant + usuario al pie */}
        <div className="border-t border-line dark:border-ink-700 p-3 space-y-2">
          {/* Tenant */}
          <div>
            <button
              onClick={() => {
                setTenantOpen((v) => !v);
                setUserOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xs text-ink-700 dark:text-slate-200 hover:bg-line-2 dark:hover:bg-ink-700 transition-colors"
            >
              <Building2 size={20} />
              <span className="flex-1 text-left text-sm font-semibold">Cambiar empresa</span>
              <ChevronDown
                size={14}
                className={cn('opacity-60 transition-transform', tenantOpen && 'rotate-90')}
              />
            </button>
            {tenantOpen && (
              <div className="mt-2 p-3 bg-line-2/60 dark:bg-ink-800 border border-line dark:border-ink-700 rounded-sm">
                <TenantSwitcher />
              </div>
            )}
          </div>

          {/* Usuario */}
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ink-700 to-ink-900 text-white flex items-center justify-center font-bold text-sm border-2 border-transparent">
              {user?.username?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: 'var(--fg-default)' }}>
                {user?.username || 'Administrador'}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--fg-muted)' }}>
                {user?.email || ''}
              </p>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-xs">
              {user?.role || 'USER'}
            </span>
          </div>

          <button
            onClick={() => {
              setMobileOpen(false);
              logout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xs text-sm font-semibold text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>

          <div
            className="flex items-center justify-between pt-2 border-t border-line-2 dark:border-ink-700 text-[10px] font-mono px-1"
            style={{ color: 'var(--fg-muted)' }}
          >
            <span>Keirost</span>
            <span>v{version || '…'}</span>
          </div>
        </div>
      </aside>
    </>
  );

  // ─────── Render ───────
  // Móvil: sólo el drawer (no hay rail).
  // Desktop: rail 60px + drawer (cuando `mobileOpen = true`).
  if (isMobile) {
    return renderDrawer();
  }

  return (
    <>
      {renderDrawer()}
      <aside
        className={cn(
          'w-[60px] flex-shrink-0 flex flex-col items-center py-3 z-20',
          'bg-white dark:bg-ink-900',
          'border-r border-line dark:border-ink-700',
        )}
      >
        {/* Módulos */}
        <div className="flex-1 flex flex-col items-center gap-1.5 w-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {modules.map((mod) => {
            const isActive = active?.id === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => handleClick(mod.id)}
                title={mod.label}
                aria-label={mod.label}
                className={cn(
                  'group relative w-11 h-11 flex items-center justify-center rounded-xs',
                  'transition-all duration-200 ease-out',
                  'hover:scale-110',
                  isActive
                    ? 'bg-accent/15 text-accent dark:bg-accent/20 dark:text-accent'
                    : 'text-ink-500 dark:text-ink-400 hover:bg-line-2 dark:hover:bg-ink-700 hover:text-accent dark:hover:text-accent',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent" />
                )}
                <PluginIcon iconName={mod.icon} size={20} />
                <span
                  className={cn(
                    'absolute left-full ml-2 px-2 py-1 rounded-md',
                    'bg-slate-900 text-white dark:bg-slate-700 text-xs font-medium whitespace-nowrap',
                    'opacity-0 pointer-events-none translate-x-1',
                    'group-hover:opacity-100 group-hover:translate-x-0',
                    'transition-all duration-150 z-50 shadow-lg',
                  )}
                >
                  {mod.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tenant + Usuario al pie */}
        <div className="flex flex-col items-center gap-2 w-full pt-2 border-t border-line dark:border-ink-700">
          <div className="relative" ref={tenantRef}>
            <button
              onClick={() => {
                setTenantOpen((v) => !v);
                setUserOpen(false);
              }}
              title="Cambiar empresa"
              aria-label="Cambiar empresa"
              className={cn(
                'group relative w-11 h-11 flex items-center justify-center rounded-xs',
                'transition-all duration-200 ease-out hover:scale-110',
                tenantOpen
                  ? 'bg-accent/15 text-accent dark:bg-accent/20 dark:text-accent'
                  : 'text-ink-500 dark:text-ink-400 hover:bg-line-2 dark:hover:bg-ink-700 hover:text-accent dark:hover:text-accent',
              )}
            >
              <Building2 size={20} />
            </button>
            {tenantOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-72 p-3 bg-white dark:bg-ink-800 border border-line dark:border-ink-700 rounded-sm shadow-xl z-50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-2">
                  Empresa activa
                </p>
                <TenantSwitcher />
              </div>
            )}
          </div>

          <div className="relative" ref={userRef}>
            <button
              onClick={() => {
                setUserOpen((v) => !v);
                setTenantOpen(false);
              }}
              title={user?.username || 'Usuario'}
              aria-label="Menú de usuario"
              className={cn(
                'group relative w-10 h-10 flex items-center justify-center rounded-full',
                'transition-all duration-200 ease-out hover:scale-110',
                'bg-gradient-to-br from-ink-700 to-ink-900 text-white',
                'border-2',
                userOpen ? 'border-accent' : 'border-transparent',
              )}
            >
              <span className="text-xs font-bold">
                {user?.username?.charAt(0)?.toUpperCase() || 'A'}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-ink-900 rounded-full" />
            </button>
            {userOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-56 p-3 bg-white dark:bg-ink-800 border border-line dark:border-ink-700 rounded-sm shadow-xl z-50">
                <div className="mb-2 pb-2 border-b border-line-2 dark:border-ink-700">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--fg-default)' }}>
                    {user?.username || 'Administrador'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
                    {user?.email || ''}
                  </p>
                  <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-xs">
                    {user?.role || 'USER'}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setUserOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xs text-sm font-medium text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
                <div
                  className="mt-2 pt-2 border-t border-line-2 dark:border-ink-700 text-[10px] font-mono flex items-center justify-between"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  <span>Keirost</span>
                  <span>v{version || '…'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};

/** Fila del drawer móvil: un módulo que al tocar despliega sus sub-tabs. */
const MobileModuleAccordion: React.FC<{
  mod: Module;
  isActive: boolean;
  currentPath: string;
  onNavigate: (path: string) => void;
}> = ({ mod, isActive, currentPath, onNavigate }) => {
  const [open, setOpen] = useState(isActive);
  useEffect(() => {
    if (isActive) setOpen(true);
  }, [isActive]);

  const { user } = useAuth();
  const { flags } = useTheme();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
  // Mostramos todos los subtabs y marcamos los inactivos por flag para que el
  // usuario los descubra y pueda activarlos desde Ajustes. Sólo escondemos los
  // que el usuario realmente no puede ver (adminOnly sin permiso).
  const visibleSubTabs = mod.subTabs
    .filter((s: any) => {
      if (!isAdmin && s.adminOnly) return false;
      return true;
    })
    .map((s: any) => ({
      ...s,
      _disabled: !!(s.featureFlag && !(flags as any)[s.featureFlag]),
    }));
  const hasSubs = visibleSubTabs.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (!hasSubs) return;
          setOpen((v) => !v);
        }}
        className={cn(
          'w-full flex items-center gap-4 px-5 py-3.5 text-left transition-colors border-l-4',
          isActive
            ? 'bg-accent/10 text-accent border-accent'
            : 'text-ink-700 dark:text-slate-200 hover:bg-line-2 dark:hover:bg-ink-700 border-transparent',
        )}
      >
        <PluginIcon iconName={mod.icon} size={22} />
        <span className="flex-1 text-sm font-semibold tracking-tight">{mod.label}</span>
        {hasSubs && (
          <ChevronDown
            size={16}
            className={cn('opacity-60 transition-transform', open && 'rotate-180')}
          />
        )}
      </button>
      {open && hasSubs && (
        <div className="bg-line-2/40 dark:bg-ink-900/60 border-l-4 border-accent/20">
          {visibleSubTabs.map((sub: any) => {
            const subActive = sub.path === currentPath;
            const disabled = sub._disabled;
            return (
              <button
                key={sub.id}
                onClick={() => onNavigate(disabled ? '/settings/company' : sub.path)}
                title={disabled ? `Activa "${sub.featureFlag}" en Ajustes` : undefined}
                className={cn(
                  'w-full flex items-center gap-3 pl-14 pr-5 py-2.5 text-left text-sm transition-colors',
                  subActive
                    ? 'text-accent font-semibold'
                    : disabled
                      ? 'text-ink-400 dark:text-ink-500 hover:bg-line-2 dark:hover:bg-ink-700 font-medium'
                      : 'text-ink-700 dark:text-ink-400 hover:text-accent hover:bg-line-2 dark:hover:bg-ink-700 font-medium',
                )}
              >
                {sub.icon && <PluginIcon iconName={sub.icon} size={14} />}
                <span className="flex-1 truncate">{sub.label}</span>
                <StatusBadge status={sub.status} />
                {disabled && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-xs">
                    Inactivo
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
