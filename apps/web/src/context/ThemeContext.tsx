import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { useAuth } from './AuthContext';

export interface BrandingConfig {
  colorPrimary: string;
  colorAccent: string;
  logoUrl: string;
  appName: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  themeMode: 'light' | 'dark';
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
  confirmBeforeCancel: boolean;
  enforceWarehouseZones: boolean;
  /** 'header' = un almacén único en la cabecera; 'line' = almacén + ubicación por línea. */
  warehouseLocation: 'header' | 'line';
  /** Activa el módulo de logística (envíos, rutas, mapa en tiempo real). */
  logisticsEnabled: boolean;
  /** Oculta todos los módulos excepto logística e inventario. */
  logisticsOnly?: boolean;
}

// Defaults de la marca Keirost — paleta teal + ink (brand guide v1.0).
// El usuario puede sobreescribir colorPrimary / colorAccent / logoUrl /
// themeMode desde Ajustes → Empresa → Branding; estos son solo el punto de
// partida.
export const BRANDING_DEFAULTS: BrandingConfig = {
  colorPrimary: '#0A1628', // ink — texto/botones principales
  colorAccent: '#0D9488',  // teal — acento, links, CTAs
  logoUrl: '',
  appName: 'Keirost',
  fontFamily: 'sans',
  themeMode: 'light',
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
  confirmBeforeCancel: true,
  enforceWarehouseZones: false,
  warehouseLocation: 'header',
  logisticsEnabled: false,
  logisticsOnly: false,
};

export interface ThemePreset {
  id: string;
  label: string;
  description: string;
  colorPrimary: string;
  colorAccent: string;
  themeMode: 'light' | 'dark';
}

// Presets de tema inspirados en las variantes del logo del brand guide v1.0.
// "custom" se asigna automáticamente cuando el usuario edita un color a mano.
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'keirost-classic',
    label: 'Keirost Clásico',
    description: 'Ink + Teal — el predeterminado del brand guide.',
    colorPrimary: '#0A1628',
    colorAccent: '#0D9488',
    themeMode: 'light',
  },
  {
    id: 'keirost-teal',
    label: 'Teal Fuerte',
    description: 'Teal protagonista, ink secundario. Para marcas activas.',
    colorPrimary: '#0D9488',
    colorAccent: '#0A6E63',
    themeMode: 'light',
  },
  {
    id: 'keirost-slate',
    label: 'Slate Monocromo',
    description: 'Gris neutro, sin acento de marca. Look discreto.',
    colorPrimary: '#1E293B',
    colorAccent: '#64748B',
    themeMode: 'light',
  },
  {
    id: 'keirost-midnight',
    label: 'Midnight',
    description: 'Base oscura con acento teal. Ideal para salas de control.',
    colorPrimary: '#0A1628',
    colorAccent: '#0D9488',
    themeMode: 'dark',
  },
  {
    id: 'keirost-carbon',
    label: 'Carbon',
    description: 'Grafito profundo con acento ámbar. Sobrio, industrial.',
    colorPrimary: '#18181B',
    colorAccent: '#F59E0B',
    themeMode: 'dark',
  },
  {
    id: 'keirost-deep-ocean',
    label: 'Deep Ocean',
    description: 'Azul abisal con acento cyan. Fresco y tecnológico.',
    colorPrimary: '#0C1E3A',
    colorAccent: '#22D3EE',
    themeMode: 'dark',
  },
  {
    id: 'keirost-forest',
    label: 'Forest',
    description: 'Verde bosque con acento lima. Natural, calmado.',
    colorPrimary: '#0F1F1A',
    colorAccent: '#84CC16',
    themeMode: 'dark',
  },
  {
    id: 'keirost-plum',
    label: 'Plum',
    description: 'Ciruela oscuro con acento rosa. Elegante y contrastado.',
    colorPrimary: '#1E102C',
    colorAccent: '#EC4899',
    themeMode: 'dark',
  },
  {
    id: 'keirost-nebula',
    label: 'Nebula',
    description: 'Azul noche con acento violeta. Inmersivo, premium.',
    colorPrimary: '#0F1430',
    colorAccent: '#8B5CF6',
    themeMode: 'dark',
  },
];

/** Devuelve el id del preset que coincide con branding actual, o 'custom'. */
export function detectPreset(b: BrandingConfig): string {
  const match = THEME_PRESETS.find(
    (p) =>
      p.colorPrimary.toLowerCase() === b.colorPrimary.toLowerCase() &&
      p.colorAccent.toLowerCase() === b.colorAccent.toLowerCase() &&
      p.themeMode === b.themeMode,
  );
  return match?.id ?? 'custom';
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

/** Devuelve el RGB aclarado un porcentaje (0..1) hacia blanco. */
function lightenRgb(rgb: [number, number, number], amount: number): [number, number, number] {
  return [
    Math.min(255, Math.floor(rgb[0] + (255 - rgb[0]) * amount)),
    Math.min(255, Math.floor(rgb[1] + (255 - rgb[1]) * amount)),
    Math.min(255, Math.floor(rgb[2] + (255 - rgb[2]) * amount)),
  ];
}

function rgbToHex(rgb: [number, number, number]): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

function fontStackForFamily(family: BrandingConfig['fontFamily']): string {
  switch (family) {
    case 'serif':
      return "Georgia, 'Times New Roman', Times, serif";
    case 'mono':
      return "'SFMono-Regular', Menlo, Monaco, 'Courier New', monospace";
    default:
      return "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  }
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
        const res = await fetch(`/api/config/${section}`, {
          headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': user.tenantId },
        });
        if (!res.ok) return null;
        return (await res.json()) as T;
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
      const res = await fetch(`/api/config/${section}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-tenant-id': user.tenantId,
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error al guardar' }));
        throw new Error(err.error || 'Error al guardar');
      }
      const data = await res.json();
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

    root.style.setProperty('--font-sans', fontStackForFamily(branding.fontFamily));
    document.title = branding.appName;
    root.classList.toggle('dark', branding.themeMode === 'dark');

    // En modo dark, derivamos el fondo de app/card del color primario del tema.
    // Así cada preset oscuro (Midnight, Carbon, Deep Ocean, Forest, Plum,
    // Nebula) tiene su propio color base en lugar de compartir #0A1628.
    if (branding.themeMode === 'dark') {
      const bgApp = rgbToHex(primaryRgb);
      const bgCard = rgbToHex(lightenRgb(primaryRgb, 0.06));
      const borderDefault = rgbToHex(lightenRgb(primaryRgb, 0.14));
      root.style.setProperty('--bg-app', bgApp);
      root.style.setProperty('--bg-card', bgCard);
      root.style.setProperty('--border-default', borderDefault);
      // Fuerza que el <html> y body vean el fondo correcto antes del siguiente
      // pintado (evita flash de #0A1628 hardcoded en index.css).
      root.style.background = bgApp;
    } else {
      root.style.removeProperty('--bg-app');
      root.style.removeProperty('--bg-card');
      root.style.removeProperty('--border-default');
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
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      /* noop */
    }
  }, [branding, format, flags, user?.tenantId]);

  const applyPreset = useCallback(
    async (presetId: string) => {
      const preset = THEME_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      await update('branding', {
        colorPrimary: preset.colorPrimary,
        colorAccent: preset.colorAccent,
        themeMode: preset.themeMode,
      });
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
