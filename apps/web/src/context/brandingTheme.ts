import {
  contrastRatio,
  darken,
  getThemePreset,
  hexToRgb,
  lighten,
  MOTION_CHARACTERS,
  resolveTheme,
  type ThemeInput,
} from '@openfactu/ui';
import type { BrandingConfig } from './ThemeContext';

/** Lo que elige cada usuario en su perfil. Lo que quede en null es lo de la empresa. */
export interface UserTheme {
  preset: string | null;
  mode: 'light' | 'dark' | null;
}

/** Aclara u oscurece un color hasta que se lea sobre la superficie (3:1, lo de botones). */
function legibleOn(hex: string, surface: string, mode: 'light' | 'dark'): string {
  const shift = mode === 'dark' ? lighten : darken;
  let color = hex;
  for (let i = 1; i <= 9 && contrastRatio(hexToRgb(color), hexToRgb(surface)) < 3; i++) {
    color = shift(hex, i / 10);
  }
  return color;
}

/**
 * Un tema en el modo contrario al suyo. Sus superficies, sombras y fondos están
 * elegidos para el modo original, así que se quedan fuera y `resolveTheme` los
 * deriva de los colores de marca, que además hay que hacer legibles: el acento
 * de «Blanco y Negro» es negro, y sobre un fondo oscuro no se vería.
 */
function withMode(theme: ThemeInput, mode: 'light' | 'dark'): ThemeInput {
  if ((theme.mode ?? 'light') === mode) return theme;
  const base = resolveTheme({
    mode,
    colors: { primary: theme.colors?.primary, accent: theme.colors?.accent },
  });
  const surface = base.colors.bgCard;
  return {
    mode,
    radius: theme.radius,
    typography: theme.typography,
    density: theme.density,
    motion: theme.motion,
    colors: {
      // En oscuro el primario pone el matiz de las superficies: ThemeContext ya
      // pasa los botones al acento si no contrasta. En claro no hay ese relevo.
      primary:
        mode === 'light' ? legibleOn(base.colors.primary, surface, mode) : base.colors.primary,
      accent: legibleOn(base.colors.accent, surface, mode),
    },
  };
}

/**
 * El tema de un usuario sobre el de la empresa. Con preset propio se usa el
 * preset tal cual, sin los retoques de la empresa (fuente, radio, densidad…),
 * para que se vea igual en todas sus empresas; con solo el modo, se sigue viendo
 * el de la empresa en ese modo. Un preset desconocido (de un plugin que ya no
 * está) cuenta como no elegido.
 */
export function userThemeToInput(branding: BrandingConfig, userTheme: UserTheme): ThemeInput {
  const preset = userTheme.preset ? getThemePreset(userTheme.preset) : undefined;
  const base = preset ? preset.theme : brandingToThemeInput(branding);
  return userTheme.mode ? withMode(base, userTheme.mode) : base;
}

/**
 * Traduce el branding guardado de la empresa al tema de @openfactu/ui.
 *
 * Con preset se parte del tema completo del preset (superficies, radios,
 * sombras, cristal, tipografía…); sin él, de los dos colores y el modo. Encima
 * van los ajustes finos del branding, que solo pisan al preset si tienen valor.
 */
export function brandingToThemeInput(branding: BrandingConfig): ThemeInput {
  const preset = branding.themePreset ? getThemePreset(branding.themePreset) : undefined;
  const base: ThemeInput = preset
    ? preset.theme
    : {
        mode: branding.themeMode,
        colors: { primary: branding.colorPrimary, accent: branding.colorAccent },
      };

  const typography = { ...base.typography };
  // 'sans' es la fuente de marca por defecto: con ella manda la del preset, si
  // trae una. Cualquier otra elección de la empresa gana siempre. Hay que quitar
  // `sans`/`display` del preset porque, si no, ganan sobre `fontFamily`.
  if (branding.fontFamily && branding.fontFamily !== 'sans') {
    delete typography.sans;
    delete typography.display;
    typography.fontFamily = branding.fontFamily;
  }
  if (branding.textScale && branding.textScale !== 1) typography.scale = branding.textScale;

  const motion = { ...base.motion };
  if (branding.motionCharacter && branding.motionCharacter in MOTION_CHARACTERS) {
    motion.character = branding.motionCharacter as keyof typeof MOTION_CHARACTERS;
  }
  if (branding.motionSpeed) motion.speed = branding.motionSpeed;

  return {
    ...base,
    typography,
    motion,
    ...(branding.radius ? { radius: branding.radius } : {}),
    ...(branding.density ? { density: branding.density } : {}),
  };
}
