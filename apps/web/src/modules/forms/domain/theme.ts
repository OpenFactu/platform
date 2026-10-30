import type React from 'react';
import { contrastingFgRgb, hexToRgb, isValidHex, rgbToSpaceString } from '@openfactu/ui';
import type { FormTheme } from './types';

/**
 * Variables CSS del tema propio del formulario (acento y fondo) para el
 * contenedor que lo pinta. Sin tema, se queda la marca de la empresa.
 */
export function themeStyle(theme: FormTheme | null | undefined): React.CSSProperties {
  const style: Record<string, string> = {};
  if (theme?.accent && isValidHex(theme.accent)) {
    const rgb = hexToRgb(theme.accent);
    style['--color-accent-rgb'] = rgbToSpaceString(rgb);
    style['--color-accent-fg-rgb'] = rgbToSpaceString(contrastingFgRgb(rgb));
  }
  if (theme?.background && isValidHex(theme.background)) style.background = theme.background;
  return style as React.CSSProperties;
}
