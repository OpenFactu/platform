import { applyTheme, contrastRatio, getThemePreset, type ThemeInput } from '@openfactu/ui';
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

export interface FontOption {
  id: string;
  label: string;
  /** Spec `family=` de fonts.googleapis.com/css2. Ausente = fuente ya cargada o del sistema. */
  google?: string;
  /** Stack para --font-sans (cuerpo, tablas, formularios). */
  sans: string;
  /** Stack para --font-display (títulos, KPIs). */
  display: string;
}

/**
 * Catálogo de familias tipográficas del branding. La opción 'sans' es la marca
 * Keirost por defecto (DM Sans + Space Grotesk, definidas en index.css); el
 * resto pisa --font-sans y --font-display a la vez para que el cambio afecte a
 * TODA la app. --font-mono (código) no se toca nunca.
 */
export const FONT_OPTIONS: FontOption[] = [
  {
    id: 'sans',
    label: 'Keirost — DM Sans (por defecto)',
    sans: "'DM Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    display: "'Space Grotesk', system-ui, sans-serif",
  },
  {
    id: 'roboto',
    label: 'Roboto',
    google: 'Roboto:wght@300;400;500;700',
    sans: "'Roboto', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    display: "'Roboto', system-ui, sans-serif",
  },
  {
    id: 'roboto-flex',
    label: 'Roboto Flex (estilo Google)',
    google: 'Roboto+Flex:opsz,wght@8..144,300..800',
    sans: "'Roboto Flex', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    display: "'Roboto Flex', system-ui, sans-serif",
  },
  {
    id: 'geist',
    label: 'Geist',
    google: 'Geist:wght@300..800',
    sans: "'Geist', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
    display: "'Geist', system-ui, sans-serif",
  },
  {
    id: 'serif',
    label: 'Serif (Georgia)',
    sans: "Georgia, 'Times New Roman', Times, serif",
    display: "Georgia, 'Times New Roman', Times, serif",
  },
  {
    id: 'mono',
    label: 'Monospace',
    sans: "'SFMono-Regular', Menlo, Monaco, 'Courier New', monospace",
    display: "'SFMono-Regular', Menlo, Monaco, 'Courier New', monospace",
  },
];

export function fontOptionFor(id: string | undefined): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) || FONT_OPTIONS[0];
}

export function googleFontsUrl(font: FontOption): string | null {
  return font.google
    ? `https://fonts.googleapis.com/css2?family=${font.google}&display=swap`
    : null;
}

const CACHE_KEY = 'openfactu_theme';

interface CachedTheme {
  tenantId?: string;
  branding?: BrandingConfig;
  format?: FormatConfig;
  flags?: FlagsConfig;
  colorPrimaryRgb?: string;
  colorPrimaryHoverRgb?: string;
  colorPrimaryFgRgb?: string;
  colorAccentRgb?: string;
  colorAccentFgRgb?: string;
  // Legacy flat fields (compat con script inline en index.html)
  themeMode?: BrandingConfig['themeMode'];
  appName?: string;
  colorPrimary?: string;
  colorAccent?: string;
  fontFamily?: BrandingConfig['fontFamily'];
  logoUrl?: string;
  // Fuente precomputada (ausente con la opción por defecto) para que el script
  // inline de index.html la aplique antes de montar React, como los *Rgb.
  fontSans?: string;
  fontDisplay?: string;
  fontUrl?: string;
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

  // Aplicar branding a :root SÍNCRONAMENTE antes del paint para evitar flashes
  useLayoutEffect(() => {
    const root = document.documentElement;

    const primaryRgb = hexToRgb(branding.colorPrimary);
    const primaryHoverRgb = darkenRgb(primaryRgb, 0.1);
    const primaryFgRgb = contrastingFgRgb(primaryRgb);
    const accentRgb = hexToRgb(branding.colorAccent);
    const accentFgRgb = contrastingFgRgb(accentRgb);

    const primaryRgbStr = rgbToSpaceString(primaryRgb);
    const primaryHoverRgbStr = rgbToSpaceString(primaryHoverRgb);
    const primaryFgRgbStr = rgbToSpaceString(primaryFgRgb);
    const accentRgbStr = rgbToSpaceString(accentRgb);
    const accentFgRgbStr = rgbToSpaceString(accentFgRgb);

    root.style.setProperty('--color-primary-rgb', primaryRgbStr);
    root.style.setProperty('--color-primary-hover-rgb', primaryHoverRgbStr);
    root.style.setProperty('--color-primary-fg-rgb', primaryFgRgbStr);
    root.style.setProperty('--color-accent-rgb', accentRgbStr);
    root.style.setProperty('--color-accent-fg-rgb', accentFgRgbStr);

    const font = fontOptionFor(branding.fontFamily);
    if (font.id === 'sans') {
      // Defaults de index.css (DM Sans + Space Grotesk)
      root.style.removeProperty('--font-sans');
      root.style.removeProperty('--font-display');
    } else {
      root.style.setProperty('--font-sans', font.sans);
      root.style.setProperty('--font-display', font.display);
    }
    const fontUrl = googleFontsUrl(font);
    let fontLink = document.head.querySelector<HTMLLinkElement>('link[data-tenant-font]');
    if (fontUrl) {
      if (!fontLink) {
        fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.setAttribute('data-tenant-font', '');
        document.head.appendChild(fontLink);
      }
      if (fontLink.href !== fontUrl) fontLink.href = fontUrl;
    } else if (fontLink) {
      fontLink.remove();
    }

    document.title = branding.appName;
    root.classList.toggle('dark', branding.themeMode === 'dark');

    // Superficies, textos, bordes y escala del acento derivados del tema por
    // `resolveTheme` de @openfactu/ui, que es quien conoce la fórmula. Antes se
    // derivaban aquí a mano y sólo tres (--bg-app, --bg-card, --border-default),
    // así que todo lo que usara --bg-muted, --bg-hover, --fg-body, --fg-subtle,
    // --border-subtle/-strong o la escala --k-teal-* se quedaba con el azul y el
    // verde de fábrica: en un preset morado o grafito se veía fuera de sitio.
    const preset = branding.themePreset ? getThemePreset(branding.themePreset) : undefined;
    const themeInput: ThemeInput = preset
      ? preset.theme
      : {
          mode: branding.themeMode,
          colors: { primary: branding.colorPrimary, accent: branding.colorAccent },
        };
    const resolved = applyTheme(themeInput, undefined, {
      // La fuente de la empresa la gestiona el bloque de arriba; el preset solo
      // la cambia si trae la suya.
      injectFontLink: !!preset?.theme.typography?.fontFamily,
      transition: themeAppliedOnce.current,
    });
    themeAppliedOnce.current = true;
    const c = resolved.colors;
    root.classList.toggle('dark', resolved.mode === 'dark');

    // En oscuro, un color principal casi igual que las superficies (Carbon,
    // Midnight, Forest, Plum…) deja los botones `bg-primary` invisibles sobre
    // las tarjetas. Si no contrasta (< 3:1), esos botones pasan al acento.
    // Va después de `applyTheme`, que es quien escribe estas variables.
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

    if (resolved.mode === 'dark' && resolved.backdrop === 'none') {
      // Que <html> vea el fondo correcto antes del siguiente pintado, para no
      // enseñar el #0A1628 del anti-FOUC de index.css.
      root.style.background = c.bgApp;
    } else {
      root.style.removeProperty('background');
    }

    // Persistir cache con las tres secciones completas + RGB precomputados
    // para que el script inline en index.html aplique el tema antes de React.
    try {
      const payload: CachedTheme = {
        tenantId: user?.tenantId,
        branding,
        format,
        flags,
        // Flat fields (legacy) para el script inline en index.html
        themeMode: branding.themeMode,
        appName: branding.appName,
        colorPrimary: branding.colorPrimary,
        colorAccent: branding.colorAccent,
        fontFamily: branding.fontFamily,
        logoUrl: branding.logoUrl,
        colorPrimaryRgb: primaryRgbStr,
        colorPrimaryHoverRgb: primaryHoverRgbStr,
        colorPrimaryFgRgb: primaryFgRgbStr,
        colorAccentRgb: accentRgbStr,
        colorAccentFgRgb: accentFgRgbStr,
        ...(font.id !== 'sans'
          ? { fontSans: font.sans, fontDisplay: font.display, fontUrl: fontUrl || undefined }
          : {}),
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
