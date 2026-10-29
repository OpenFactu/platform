import {
  applyTheme,
  contrastRatio,
  fontOptionFor,
  getThemePreset,
  googleFontsUrl,
  type ThemeInput,
} from '@openfactu/ui';
import { coreApi } from '@/shared/api';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useAuth } from './AuthContext';
import { brandingToThemeInput } from './brandingTheme';

export interface BrandingConfig {
  colorPrimary: string;
  colorAccent: string;
  logoUrl: string;
  appName: string;
  /** Id de una entrada de FONT_OPTIONS; valores desconocidos caen a 'sans'. */
  fontFamily: string;
  themeMode: 'light' | 'dark';
  /** Id de un preset de @openfactu/ui (vacío = colores a medida). */
  themePreset: string;
  /** Ajustes finos sobre el tema. Vacío = lo que diga el preset (ver brandingTheme.ts). */
  radius: '' | 'none' | 'sm' | 'md' | 'lg';
  density: '' | 'compact' | 'normal' | 'comfortable';
  /** Escala del texto (0.8–1.4). */
  textScale: number;
  /** Id de MOTION_CHARACTERS de @openfactu/ui. */
  motionCharacter: string;
  motionSpeed: '' | 'none' | 'fast' | 'normal' | 'slow';
}

export interface FormatConfig {
  locale: string;
  dateFormat: string;
  decimalPrecision: number;
  quantityPrecision: number;
}

export interface FlagsConfig {
  allowNegativeStock: boolean;
  autoConfirmBatches: boolean;
  watermarkDraft: boolean;
  /** Añade la marca de agua "PAGADA" a los PDFs de facturas ya cobradas. */
  watermarkPaid: boolean;
  confirmBeforeCancel: boolean;
  enforceWarehouseZones: boolean;
  /** 'header' = un almacén único en la cabecera; 'line' = almacén + ubicación por línea. */
  warehouseLocation: 'header' | 'line';
  /** Activa el módulo de logística (envíos, rutas, mapa en tiempo real). */
  logisticsEnabled: boolean;
  /** Activa el chat de Keiro en la página pública de seguimiento (/track/:token). */
  trackingChatEnabled: boolean;
  /** Oculta todos los módulos excepto logística e inventario. */
  logisticsOnly: boolean;
  /** Sub-módulos de RRHH avanzado — cada uno desbloquea un menú/ruta sobre el módulo HR base. */
  hrShiftsEnabled: boolean;
  hrTimeclockEnabled: boolean;
  hrIncidentsEnabled: boolean;
  hrPlanningEnabled: boolean;
  /** RRHH avanzado+: convenios, evaluaciones, comisiones, rendimiento, coste laboral, tareas y Gantt. */
  hrAdvancedEnabled: boolean;
  /** Módulos core activables desde /apps. Default true: preserva el
   *  comportamiento de cualquier tenant existente. */
  inventoryEnabled: boolean;
  salesEnabled: boolean;
  purchasesEnabled: boolean;
  partnersEnabled: boolean;
  accountingEnabled: boolean;
  analyticsEnabled: boolean;
  reportsEnabled: boolean;
  hrEnabled: boolean;
  assistantEnabled: boolean;
  /** CRM: oportunidades, contactos y actividades. Opcional, off por defecto. */
  crmEnabled: boolean;
  /** CRM · formularios y encuestas con enlace público. */
  crmFormsEnabled: boolean;
  /** Ofrecer «Crear Factura» en el presupuesto (facturarlo sin pasar por pedido). */
  quoteDirectInvoiceEnabled: boolean;
}

// Defaults de la marca Keirost — paleta teal + ink (brand guide v1.0).
// El usuario puede sobreescribir colorPrimary / colorAccent / logoUrl /
// themeMode desde Ajustes → Empresa → Branding; estos son solo el punto de
// partida.
export const BRANDING_DEFAULTS: BrandingConfig = {
  colorPrimary: '#0A1628', // ink — texto/botones principales
  colorAccent: '#0D9488', // teal — acento, links, CTAs
  logoUrl: '',
  appName: 'Keirost',
  fontFamily: 'sans',
  themeMode: 'light',
  themePreset: '',
  radius: '',
  density: '',
  textScale: 1,
  motionCharacter: '',
  motionSpeed: '',
};

export const FORMAT_DEFAULTS: FormatConfig = {
  locale: 'es-ES',
  dateFormat: 'dd/MM/yyyy',
  decimalPrecision: 2,
  quantityPrecision: 2,
};

export const FLAGS_DEFAULTS: FlagsConfig = {
  allowNegativeStock: false,
  autoConfirmBatches: false,
  watermarkDraft: true,
  watermarkPaid: false,
  confirmBeforeCancel: true,
  enforceWarehouseZones: false,
  warehouseLocation: 'header',
  logisticsEnabled: false,
  trackingChatEnabled: false,
  logisticsOnly: false,
  hrShiftsEnabled: false,
  hrTimeclockEnabled: false,
  hrIncidentsEnabled: false,
  hrPlanningEnabled: false,
  hrAdvancedEnabled: false,
  inventoryEnabled: true,
  salesEnabled: true,
  purchasesEnabled: true,
  partnersEnabled: true,
  accountingEnabled: true,
  analyticsEnabled: true,
  reportsEnabled: true,
  hrEnabled: true,
  assistantEnabled: true,
  crmEnabled: false,
  crmFormsEnabled: false,
  quoteDirectInvoiceEnabled: true,
};

/** Colores y modo con los que se muestra un preset en los selectores. */
export function presetSwatch(preset: { theme: ThemeInput }) {
  return {
    colorPrimary: preset.theme.colors?.primary ?? BRANDING_DEFAULTS.colorPrimary,
    colorAccent: preset.theme.colors?.accent ?? BRANDING_DEFAULTS.colorAccent,
    themeMode: (preset.theme.mode ?? 'light') as 'light' | 'dark',
  };
}

/** Id del preset activo, o 'custom' si los colores se ajustaron a mano. */
export function detectPreset(b: BrandingConfig): string {
  return b.themePreset && getThemePreset(b.themePreset) ? b.themePreset : 'custom';
}

interface ThemeContextType {
  branding: BrandingConfig;
  format: FormatConfig;
  flags: FlagsConfig;
  loading: boolean;
  reload: () => Promise<void>;
  update: (section: 'branding' | 'format' | 'flags', patch: any) => Promise<void>;
  applyPreset: (presetId: string) => Promise<void>;
  activePresetId: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  if (h.length !== 6) return [37, 99, 235];
  const num = parseInt(h, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function rgbToSpaceString(rgb: [number, number, number]): string {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
}

/** Devuelve los componentes RGB oscurecidos un porcentaje (0..1). */
function darkenRgb(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.max(0, Math.floor(rgb[0] * (1 - amount))),
    Math.max(0, Math.floor(rgb[1] * (1 - amount))),
    Math.max(0, Math.floor(rgb[2] * (1 - amount))),
  ];
}

/** Foreground blanco o oscuro según luminancia del fondo. */
function contrastingFgRgb(rgb: [number, number, number]): [number, number, number] {
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luminance > 0.6 ? [15, 23, 42] : [255, 255, 255];
}

// El catálogo de fuentes es el de la librería: así el id que se guarda es el
// mismo que entiende `resolveTheme` (typography.fontFamily).
export { FONT_OPTIONS, fontOptionFor, googleFontsUrl, type FontOption } from '@openfactu/ui';

const CACHE_KEY = 'openfactu_theme';

interface CachedTheme {
  tenantId?: string;
  branding?: BrandingConfig;
  format?: FormatConfig;
  flags?: FlagsConfig;
  // Lo que lee el script inline de index.html para pintar el tema antes de
  // montar React: todas las variables y atributos que dejó el último tema.
  themeMode?: BrandingConfig['themeMode'];
  appName?: string;
  vars?: Record<string, string>;
  attrs?: Record<string, string>;
  fontUrl?: string;
  // Formato anterior (solo para leerlo: readCachedBranding)
  colorPrimary?: string;
  colorAccent?: string;
  fontFamily?: BrandingConfig['fontFamily'];
  logoUrl?: string;
}

function readCache(): CachedTheme | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedTheme;
  } catch {
    return null;
  }
}

function readCachedBranding(): BrandingConfig {
  const cached = readCache();
  if (!cached) return BRANDING_DEFAULTS;
  if (cached.branding) return { ...BRANDING_DEFAULTS, ...cached.branding };
  // Compat con formato antiguo
  return {
    ...BRANDING_DEFAULTS,
    themeMode: cached.themeMode || BRANDING_DEFAULTS.themeMode,
    appName: cached.appName || BRANDING_DEFAULTS.appName,
    colorPrimary: cached.colorPrimary || BRANDING_DEFAULTS.colorPrimary,
    colorAccent: cached.colorAccent || BRANDING_DEFAULTS.colorAccent,
    fontFamily: cached.fontFamily || BRANDING_DEFAULTS.fontFamily,
    logoUrl: cached.logoUrl || BRANDING_DEFAULTS.logoUrl,
  };
}

function readCachedFormat(): FormatConfig {
  const cached = readCache();
  if (cached?.format) return { ...FORMAT_DEFAULTS, ...cached.format };
  return FORMAT_DEFAULTS;
}

function readCachedFlags(): FlagsConfig {
  const cached = readCache();
  if (cached?.flags) return { ...FLAGS_DEFAULTS, ...cached.flags };
  return FLAGS_DEFAULTS;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [branding, setBranding] = useState<BrandingConfig>(readCachedBranding);
  const [format, setFormat] = useState<FormatConfig>(readCachedFormat);
  const [flags, setFlags] = useState<FlagsConfig>(readCachedFlags);
  const [loading, setLoading] = useState(false);

  const fetchSection = useCallback(
    async <T,>(section: string): Promise<T | null> => {
      if (!token || !user?.tenantId) return null;
      try {
        const res = await coreApi.raw('GET', `/api/config/${section}`);
        if (!res.ok) return null;
        return res.data as T;
      } catch {
        return null;
      }
    },
    [token, user?.tenantId],
  );

  const reload = useCallback(async () => {
    // Sin tenant: NO resetear estado — mantenemos lo que haya en el cache
    // (ya sea por el init o por un tenant previo). Esto evita un flash a light
    // mientras AuthContext carga /me al inicio.
    if (!user?.tenantId) return;

    setLoading(true);
    try {
      const [b, f, g] = await Promise.all([
        fetchSection<BrandingConfig>('branding'),
        fetchSection<FormatConfig>('format'),
        fetchSection<FlagsConfig>('flags'),
      ]);
      if (b) setBranding({ ...BRANDING_DEFAULTS, ...b });
      if (f) setFormat({ ...FORMAT_DEFAULTS, ...f });
      if (g) setFlags({ ...FLAGS_DEFAULTS, ...g });
    } finally {
      setLoading(false);
    }
  }, [fetchSection, user?.tenantId]);

  const update = useCallback(
    async (section: 'branding' | 'format' | 'flags', patch: any) => {
      if (!token || !user?.tenantId) throw new Error('No autenticado');
      const res = await coreApi.raw('PUT', `/api/config/${section}`, patch);
      if (!res.ok) {
        const err = res.data ?? { error: 'Error al guardar' };
        throw new Error(err.error || 'Error al guardar');
      }
      const data = res.data;
      if (section === 'branding') setBranding({ ...BRANDING_DEFAULTS, ...data });
      if (section === 'format') setFormat({ ...FORMAT_DEFAULTS, ...data });
      if (section === 'flags') setFlags({ ...FLAGS_DEFAULTS, ...data });
    },
    [token, user?.tenantId],
  );

  // Recargar cuando cambia el tenant activo
  useEffect(() => {
    reload();
  }, [reload]);

  const themeAppliedOnce = useRef(false);

  // Aplicar branding a :root SÍNCRONAMENTE antes del paint para evitar flashes.
  // Todo el tema lo escribe `applyTheme` de @openfactu/ui: colores, superficies,
  // fuente (y su <link> de Google Fonts), radios, densidad, movimiento,
  // cristal… La app solo añade lo que la librería no sabe (abajo).
  useLayoutEffect(() => {
    const root = document.documentElement;
    document.title = branding.appName;

    const resolved = applyTheme(brandingToThemeInput(branding), undefined, {
      transition: themeAppliedOnce.current,
    });
    themeAppliedOnce.current = true;
    // Restos de cuando la app ponía la fuente por su cuenta.
    document.head.querySelector('link[data-tenant-font]')?.remove();

    // En oscuro, un color principal casi igual que las superficies (Carbon,
    // Midnight, Forest, Plum…) deja los botones `bg-primary` invisibles sobre
    // las tarjetas. Si no contrasta (< 3:1), esos botones pasan al acento.
    // Va después de `applyTheme`, que es quien escribe estas variables.
    const c = resolved.colors;
    if (resolved.mode === 'dark') {
      const primary = hexToRgb(c.primary);
      if (contrastRatio(primary, hexToRgb(c.bgCard)) < 3) {
        const accent = hexToRgb(c.accent);
        root.style.setProperty('--color-primary-rgb', rgbToSpaceString(accent));
        root.style.setProperty(
          '--color-primary-hover-rgb',
          rgbToSpaceString(darkenRgb(accent, 0.1)),
        );
        root.style.setProperty(
          '--color-primary-fg-rgb',
          rgbToSpaceString(contrastingFgRgb(accent)),
        );
      }
    }

    // Persistir cache con las tres secciones completas + el tema ya escrito,
    // para que el script inline en index.html lo aplique antes de React.
    try {
      const vars: Record<string, string> = {};
      for (let i = 0; i < root.style.length; i++) {
        const name = root.style[i];
        if (name.startsWith('--') && name !== '--k-theme-transition') {
          vars[name] = root.style.getPropertyValue(name);
        }
      }
      const attrs: Record<string, string> = {};
      for (const attr of Array.from(root.attributes)) {
        if (attr.name.startsWith('data-k-')) attrs[attr.name] = attr.value;
      }
      const payload: CachedTheme = {
        tenantId: user?.tenantId,
        branding,
        format,
        flags,
        themeMode: resolved.mode,
        appName: branding.appName,
        vars,
        attrs,
        fontUrl: googleFontsUrl(fontOptionFor(resolved.typography.fontFamily)) || undefined,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }, [branding, format, flags, user?.tenantId]);

  const applyPreset = useCallback(
    async (presetId: string) => {
      const preset = getThemePreset(presetId);
      if (!preset) return;
      await update('branding', { ...presetSwatch(preset), themePreset: preset.id });
    },
    [update],
  );

  const activePresetId = detectPreset(branding);

  return (
    <ThemeContext.Provider
      value={{ branding, format, flags, loading, reload, update, applyPreset, activePresetId }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
