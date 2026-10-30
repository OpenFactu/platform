import { getThemePreset, MOTION_CHARACTERS, type ThemeInput } from '@openfactu/ui';
import type { BrandingConfig } from './ThemeContext';

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
