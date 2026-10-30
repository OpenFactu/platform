import { coreApi } from '@/shared/api';
import React, { useState, useRef, useEffect, useMemo } from 'react';
// Phosphor, el estilo de iconos del menú (ver components/icons/phosphorIcons.ts).
import { BuildingsIcon, CaretDownIcon, SignOutIcon, XIcon } from '@phosphor-icons/react';
import { cn, Tooltip, Badge, SearchInput, useScrollLock } from '@openfactu/ui';
import { useModules, useActiveModule } from '../../context/PluginContext';
import { useTabs } from '../../context/TabsContext';
import { useAuth } from '../../context/AuthContext';
import { useMobileNav } from '../../context/MobileNavContext';
import { useTheme } from '../../context/ThemeContext';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { PluginIcon } from '../PluginIcon';
import { visibleModules, visibleSubTabs, canSeeSubTab } from '@/modules/permissions';
import { iconNameFor } from '@/modules/routeLookup';
import { TenantSwitcher } from '../TenantSwitcher';
import type { Module } from '../../modules/registry';
import { useI18n } from '@/i18n/I18nContext';

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
  const { t } = useI18n();
  const modules = (() => {
    if (user?.role === 'DRIVER') {
      // Sidebar simplificado para conductores: solo su app.
      return [
        {
          id: 'driver',
          label: t('app.nav.myRoute'),
          icon: 'Navigation',
          subTabs: [{ id: 'driver-home', label: t('app.nav.myRoute'), path: '/driver' }],
        } as Module,
      ];
    }
    // Rol, flags Y permisos. Lo último faltaba: el icono se pintaba igual
    // aunque el usuario no pudiera entrar en ninguna de sus pantallas, y solo
    // al pulsarlo `PermittedRoute` lo devolvía al inicio.
    return visibleModules(allModules, { user, flags });
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
  // Con el menú abierto en móvil, la página de detrás no se desplaza.
  useScrollLock(isMobile && mobileOpen);

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
    // El buscador ofrece exactamente lo mismo que el menú: si no lo puedes
    // ver en el sidebar, tampoco debe salirte al escribir su nombre.
    const navCtx = { user, flags };
    for (const mod of visibleModules(allModules, navCtx)) {
      for (const sub of visibleSubTabs(mod, navCtx) as any[]) {
        const hay = norm(`${mod.label} ${sub.label} ${sub.group || ''} ${sub.id}`);
        if (!tokens.every((t) => hay.includes(t))) continue;
        out.push({ modLabel: mod.label, modIcon: mod.icon, sub });
      }
    }
    return out.slice(0, 30);
  }, [query, allModules, flags, isAdmin, user]);

  // Cerrar los popovers del raíl al pulsar fuera. `tenantRef`/`userRef` cuelgan
  // SOLO del raíl: dentro del drawer los mismos estados pintan un acordeón
  // inline, así que cualquier clic ahí cae fuera de esas refs y cerraba la
  // sección antes de que el desplegable de empresas llegase a abrirse. Por eso
  // el listener se apaga mientras el drawer está abierto, no solo en móvil.
  useEffect(() => {
    if (isMobile || mobileOpen) return;
    const onClick = (e: MouseEvent) => {
      if (tenantRef.current && !tenantRef.current.contains(e.target as Node)) setTenantOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isMobile, mobileOpen]);

  const handleClick = (modId: string) => {
    const mod = modules.find((m) => m.id === modId);
    if (!mod) return;

    // La PRIMERA QUE PUEDA ABRIR, no la primera a secas. Un usuario con permiso
    // solo sobre "Series de numeración" ve el icono de Documentos —y hace bien,
    // algo tiene ahí dentro—, pero llevarlo a Presupuestos, que es el primer
    // sub-tab, lo devolvía al inicio nada más pulsar.
    const destino = visibleSubTabs(mod, { user, flags })[0];
    if (!destino) return;

    // Siempre cerramos el drawer al navegar (también en desktop)
    setMobileOpen(false);
    openTab(destino.path);
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
          'w-full md:w-[360px] md:border-r md:border-border-default',
          'transition-transform duration-250 ease-out',
          // La sombra solo con el menú abierto: con una sombra dura desplazada
          // (tema Blanco y Negro) asomaba una franja gris por el borde izquierdo.
          mobileOpen ? 'translate-x-0 md:shadow-k-overlay' : '-translate-x-full',
        )}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        aria-hidden={!mobileOpen}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between pl-4 pr-2 h-12 border-b border-border-default">
          <span className="font-display text-base font-bold text-fg-default">
            {t('app.sidebar.menu')}
          </span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-xs text-fg-muted hover:text-accent hover:bg-bg-hover transition-colors"
            aria-label={t('app.sidebar.closeMenu')}
          >
            <XIcon size={20} />
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
            placeholder={t('app.sidebar.searchPlaceholder')}
            clearable
          />
        </div>

        {/* Resultados de búsqueda o lista de módulos */}
        <nav className="flex-1 overflow-y-auto overscroll-contain py-1">
          {query.trim() ? (
            searchResults.length === 0 ? (
              <p className="px-5 py-6 text-sm text-fg-muted">
                {t('app.sidebar.noResults', { query })}
              </p>
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
                    <PluginIcon iconName={modIcon} size={16} family="phosphor" />
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

        {/* Pie compacto: una fila con el usuario y dos accesos (empresa, salir).
            El selector de empresa se despliega encima, solo cuando se pide. */}
        <div className="border-t border-border-default px-3 py-2">
          {tenantOpen && (
            <div className="mb-2 p-2 bg-bg-muted border border-border-default rounded-sm">
              <TenantSwitcher />
            </div>
          )}
          <div className="flex items-center gap-2.5">
            {user?.avatarImageUrl ? (
              <img
                src={user.avatarImageUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary text-primary-fg flex items-center justify-center font-bold text-xs shrink-0">
                {user?.username?.charAt(0)?.toUpperCase() || 'A'}
              </div>
            )}
            <div className="flex-1 min-w-0 leading-tight">
              <p className="text-[13px] font-semibold text-fg-default truncate">
                {user?.username || t('app.sidebar.admin')}
              </p>
              <p className="text-[11px] text-fg-muted truncate">
                {user?.role || 'USER'} · v{version || '…'}
              </p>
            </div>
            <button
              onClick={() => {
                setTenantOpen((v) => !v);
                setUserOpen(false);
              }}
              aria-expanded={tenantOpen}
              aria-label={t('app.sidebar.switchCompany')}
              title={t('app.sidebar.switchCompany')}
              className={cn(
                'p-2 rounded-xs transition-colors',
                tenantOpen ? 'text-accent bg-accent/10' : 'text-fg-muted hover:bg-bg-hover',
              )}
            >
              <BuildingsIcon size={18} />
            </button>
            <button
              onClick={() => {
                setMobileOpen(false);
                logout();
              }}
              aria-label={t('app.sidebar.logout')}
              title={t('app.sidebar.logout')}
              className="p-2 rounded-xs text-danger-fg hover:bg-danger-bg transition-colors"
            >
              <SignOutIcon size={18} />
            </button>
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
                    <PluginIcon
                      iconName={mod.icon}
                      size={20}
                      family="phosphor"
                      weight={isActive ? 'duotone' : 'regular'}
                    />
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
              title={t('app.sidebar.switchCompany')}
              aria-label={t('app.sidebar.switchCompany')}
              className={cn(
                'relative w-11 h-10 flex items-center justify-center rounded-sm',
                'transition-colors duration-150',
                tenantOpen
                  ? 'bg-accent/15 text-accent'
                  : 'text-fg-subtle hover:bg-bg-hover hover:text-fg-default',
              )}
            >
              <BuildingsIcon size={19} />
            </button>
            {tenantOpen && (
              <div className="absolute bottom-0 left-full ml-2 w-72 p-3 bg-bg-card border border-border-default rounded-sm shadow-k-lg z-popover">
                <p className="text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-2">
                  {t('app.sidebar.activeCompany')}
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
              title={user?.username || t('app.sidebar.user')}
              aria-label={t('app.sidebar.userMenu')}
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
                    {user?.username || t('app.sidebar.admin')}
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
                  <SignOutIcon size={14} />
                  {t('app.sidebar.logout')}
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
  // Rol, flags y permisos — el mismo criterio que decide si se pinta el icono
  // del módulo, para que no puedan discrepar.
  const subTabs = mod.subTabs.filter((s: any) => canSeeSubTab(s, { user, flags }));
  const hasSubs = subTabs.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          if (!hasSubs) return;
          setOpen((v) => !v);
        }}
        aria-expanded={hasSubs ? open : undefined}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-l-2',
          isActive
            ? 'bg-accent/10 text-accent border-accent'
            : 'text-fg-body hover:bg-bg-hover border-transparent',
        )}
      >
        <PluginIcon
          iconName={mod.icon}
          size={20}
          family="phosphor"
          weight={isActive ? 'duotone' : 'regular'}
        />
        <span className="flex-1 text-sm font-semibold tracking-tight">{mod.label}</span>
        {hasSubs && (
          <CaretDownIcon
            size={14}
            className={cn('opacity-60 transition-transform', open && 'rotate-180')}
          />
        )}
      </button>
      {open && hasSubs && (
        <div className="ml-[25px] mb-1 border-l border-border-default">
          {subTabs.map((sub: any) => {
            const subActive = sub.path === currentPath;
            return (
              <button
                key={sub.id}
                onClick={() => onNavigate(sub.path)}
                className={cn(
                  'w-full flex items-center gap-2.5 pl-4 pr-4 py-2 text-left text-[13px] transition-colors -ml-px border-l',
                  subActive
                    ? 'text-accent font-semibold border-accent'
                    : 'text-fg-body hover:text-accent hover:bg-bg-hover font-medium border-transparent',
                )}
              >
                {/* El sub-tab casi nunca declara icono; el de su ruta sí existe.
                    Se comprueba antes de pintar porque `PluginIcon` sin nombre
                    dibuja una pieza de puzle, y eso es peor que nada. */}
                {iconNameFor(sub.path, sub.icon) && (
                  <PluginIcon
                    iconName={iconNameFor(sub.path, sub.icon)}
                    size={16}
                    family="phosphor"
                  />
                )}
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
