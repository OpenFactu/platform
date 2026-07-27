import { coreApi } from '@/shared/api';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LogOut, Building2, X, ChevronDown } from 'lucide-react';
import { cn, Tooltip, Badge, SearchInput } from '@openfactu/ui';
import { useModules, useActiveModule } from '../../context/PluginContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { useMobileNav } from '../../context/MobileNavContext';
import { useTheme } from '../../context/ThemeContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { PluginIcon } from '../PluginIcon';
import { NavIconChip } from './NavIconChip';
import { TenantSwitcher } from '../TenantSwitcher';
import type { Module } from '../../modules/registry';

/** Madurez de una pantalla. El tono es semántico, no decorativo: `dev` avisa
 *  de que la pantalla puede romperse, `alpha`/`beta` de que aún se mueve. */
// Ojo: el Badge del paquete llama `error` a lo que Button llama `danger`.
const STATUS_BADGE: Record<string, { label: string; variant: 'info' | 'warning' | 'error' }> = {
  alpha: { label: 'Alpha', variant: 'warning' },
  beta: { label: 'Beta', variant: 'info' },
  dev: { label: 'Dev', variant: 'error' },
};

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status || !STATUS_BADGE[status]) return null;
  const b = STATUS_BADGE[status];
  return <Badge variant={b.variant}>{b.label}</Badge>;
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
    const isAdminRole = user?.role === 'ADMIN' || user?.role === 'SUPERUSER';
    return allModules.filter((m) => {
      if (m.superuserOnly && user?.role !== 'SUPERUSER') return false;
      if (m.adminOnly && !isAdminRole) return false;
      if (m.featureFlag && !(flags as any)[m.featureFlag]) return false;
      // Modo "sólo logística": ocultamos los módulos marcados como no-logísticos.
      if (logisticsOnly && (m as any).hiddenInLogisticsOnly) return false;
      return true;
    });
  })();

  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    coreApi
      .get<any>('/api/version')
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
    }[] = [];
    for (const mod of allModules) {
      // Saltamos sólo los de SUPERUSER si el user no lo es.
      if (mod.superuserOnly && user?.role !== 'SUPERUSER') continue;
      if (mod.adminOnly && user?.role !== 'ADMIN' && user?.role !== 'SUPERUSER') continue;
      for (const sub of mod.subTabs as any[]) {
        if (!isAdmin && sub.adminOnly) continue;
        const hay = norm(`${mod.label} ${sub.label} ${sub.group || ''} ${sub.id}`);
        if (!tokens.every((t) => hay.includes(t))) continue;
        const flagOff = sub.featureFlag && !(flags as any)[sub.featureFlag];
        const modOff = mod.featureFlag && !(flags as any)[mod.featureFlag];
        if (flagOff || modOff) continue;
        out.push({ modLabel: mod.label, modIcon: mod.icon, sub });
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
          'fixed top-0 left-0 bottom-0 z-40 flex flex-col bg-bg-card',
          'w-full md:w-[360px] md:border-r md:border-border-default md:shadow-k-overlay',
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
        <div className="flex items-center justify-between px-4 h-14 border-b border-border-default">
          <span className="font-display text-lg font-bold text-fg-default">Menú</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-xs text-fg-muted hover:text-accent hover:bg-bg-hover transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={22} />
          </button>
        </div>

        {/* Buscador. El SearchInput del paquete ya trae lupa, botón de borrar y
            el Intro; aquí solo queda el Escape, que hace dos cosas distintas
            (vaciar el campo si hay texto, cerrar el menú si no). */}
        <div className="px-3 py-2 border-b border-border-default">
          <SearchInput
            inputRef={searchRef}
            value={query}
            onChange={setQuery}
            onSubmit={() => {
              if (searchResults.length === 0) return;
              setMobileOpen(false);
              openTab(searchResults[0].sub.path);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              if (query) setQuery('');
              else setMobileOpen(false);
            }}
            placeholder="Buscar en el menú…"
            clearable
          />
        </div>

        {/* Resultados de búsqueda o lista de módulos */}
        <nav className="flex-1 overflow-y-auto py-2">
          {query.trim() ? (
            searchResults.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">Sin resultados para “{query}”.</p>
            ) : (
              searchResults.map(({ modLabel, modIcon, sub }) => {
                const subActive = sub.path === pathname;
                return (
                  <button
                    key={`${modLabel}-${sub.id}`}
                    onClick={() => {
                      setMobileOpen(false);
                      openTab(sub.path);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors',
                      subActive ? 'bg-accent/10 text-accent' : 'text-fg-body hover:bg-bg-hover',
                    )}
                  >
                    <PluginIcon iconName={modIcon} size={16} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{sub.label}</p>
                      <p className="text-[11px] text-fg-muted truncate">
                        {modLabel}
                        {sub.group ? ` · ${sub.group}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={sub.status} />
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
        <div className="border-t border-border-default p-3 space-y-2">
          {/* Tenant */}
          <div>
            <button
              onClick={() => {
                setTenantOpen((v) => !v);
                setUserOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xs text-fg-body hover:bg-bg-hover transition-colors"
            >
              <Building2 size={20} />
              <span className="flex-1 text-left text-sm font-semibold">Cambiar empresa</span>
              <ChevronDown
                size={14}
                className={cn('opacity-60 transition-transform', tenantOpen && 'rotate-90')}
              />
            </button>
            {tenantOpen && (
              <div className="mt-2 p-3 bg-bg-muted border border-border-default rounded-sm">
                <TenantSwitcher />
              </div>
            )}
          </div>

          {/* Usuario */}
          <div className="flex items-center gap-3 px-3 py-2">
            {user?.avatarImageUrl ? (
              <img
                src={user.avatarImageUrl}
                alt=""
                className="w-10 h-10 rounded-full object-cover border-2 border-transparent"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary text-primary-fg flex items-center justify-center font-bold text-sm border-2 border-transparent">
                {user?.username?.charAt(0)?.toUpperCase() || 'A'}
              </div>
            )}
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
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xs text-sm font-semibold text-danger-fg hover:bg-danger-bg transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>

          <div
            className="flex items-center justify-between pt-2 border-t border-border-subtle text-[10px] font-mono px-1"
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
          'bg-bg-card',
          'border-r border-border-default',
        )}
      >
        {/*
          Módulos. Tres decisiones del rediseño:

          1. En reposo el icono va desnudo. Antes cada módulo iba metido en un
             chip con borde, así que catorce cajas idénticas competían entre sí
             y el activo no destacaba: el borde no distinguía nada, solo hacía
             ruido.
          2. El activo se marca con una barra de acento pegada al canto
             izquierdo del raíl, no solo con el relleno. Es lo que se localiza
             con visión periférica sin tener que leer iconos.
          3. Una línea fina separa cada cambio de categoría. No reordena nada:
             el separador aparece justo donde el registro ya cambia de familia
             (Operaciones → Ventas y compras → Finanzas…), la misma taxonomía
             que usa la pantalla de Apps.
        */}
        <div className="flex-1 flex flex-col items-center gap-0.5 w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {modules.map((mod, i) => {
            const isActive = active?.id === mod.id;
            const cat = mod.category || 'General';
            const startsGroup = i > 0 && (modules[i - 1].category || 'General') !== cat;
            return (
              <React.Fragment key={mod.id}>
                {startsGroup && <hr className="w-7 my-1.5 border-t border-border-subtle" />}
                <Tooltip content={mod.label} side="right">
                  <button
                    onClick={() => handleClick(mod.id)}
                    aria-label={mod.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative w-11 h-10 flex items-center justify-center rounded-sm',
                      'transition-colors duration-150',
                      isActive
                        ? 'bg-accent/15 text-accent'
                        : 'text-fg-subtle hover:bg-bg-hover hover:text-fg-default',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute -left-2 w-[3px] h-5 rounded-r-full bg-accent',
                        'transition-opacity duration-150',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden
                    />
                    <PluginIcon iconName={mod.icon} size={19} strokeWidth={isActive ? 2.4 : 2} />
                  </button>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </div>

        {/* Tenant + Usuario al pie */}
        <div className="flex flex-col items-center gap-2 w-full pt-2 border-t border-border-default">
          <div className="relative" ref={tenantRef}>
            <button
              onClick={() => {
                setTenantOpen((v) => !v);
                setUserOpen(false);
              }}
              title="Cambiar empresa"
              aria-label="Cambiar empresa"
              className={cn(
                'relative w-11 h-10 flex items-center justify-center rounded-sm',
                'transition-colors duration-150',
                tenantOpen
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-subtle hover:bg-bg-hover hover:text-fg-default',
              )}
            >
              <Building2 size={19} />
            </button>
            {tenantOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-72 p-3 bg-bg-card border border-border-default rounded-sm shadow-k-lg z-popover">
                <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-2">
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
                'relative w-9 h-9 flex items-center justify-center rounded-full overflow-hidden',
                'transition-colors duration-150',
                // `ink-*` es la escala de TEXTO y está congelada a propósito:
                // el degradado de antes dejaba el avatar azul marino con
                // cualquier tema. El primario del tenant sí lo sigue.
                !user?.avatarImageUrl && 'bg-primary text-primary-fg',
                'border-2',
                userOpen ? 'border-accent' : 'border-transparent',
              )}
            >
              {user?.avatarImageUrl ? (
                <img
                  src={user.avatarImageUrl}
                  alt=""
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-xs font-bold">
                  {user?.username?.charAt(0)?.toUpperCase() || 'A'}
                </span>
              )}
            </button>
            {userOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-56 p-3 bg-bg-card border border-border-default rounded-sm shadow-k-lg z-popover">
                <div className="mb-2 pb-2 border-b border-border-subtle">
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
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xs text-sm font-medium text-danger-fg hover:bg-danger-bg transition-colors"
                >
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
                <div
                  className="mt-2 pt-2 border-t border-border-subtle text-[10px] font-mono flex items-center justify-between"
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
  // Ocultamos los subtabs desactivados por flag (y los que el usuario no puede
  // ver por rol).
  const visibleSubTabs = mod.subTabs.filter((s: any) => {
    if (!isAdmin && s.adminOnly) return false;
    if (s.featureFlag && !(flags as any)[s.featureFlag]) return false;
    return true;
  });
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
            : 'text-fg-body hover:bg-bg-hover border-transparent',
        )}
      >
        <NavIconChip iconName={mod.icon} size={20} active={isActive} />
        <span className="flex-1 text-sm font-semibold tracking-tight">{mod.label}</span>
        {hasSubs && (
          <ChevronDown
            size={16}
            className={cn('opacity-60 transition-transform', open && 'rotate-180')}
          />
        )}
      </button>
      {open && hasSubs && (
        <div className="bg-bg-muted border-l-4 border-accent/20">
          {visibleSubTabs.map((sub: any) => {
            const subActive = sub.path === currentPath;
            return (
              <button
                key={sub.id}
                onClick={() => onNavigate(sub.path)}
                className={cn(
                  'w-full flex items-center gap-3 pl-14 pr-5 py-2.5 text-left text-sm transition-colors',
                  subActive
                    ? 'text-accent font-semibold'
                    : 'text-fg-body hover:text-accent hover:bg-bg-hover font-medium',
                )}
              >
                {sub.icon && <PluginIcon iconName={sub.icon} size={14} />}
                <span className="flex-1 truncate">{sub.label}</span>
                <StatusBadge status={sub.status} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
