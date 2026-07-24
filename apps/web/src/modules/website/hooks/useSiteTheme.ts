import { useMemo } from 'react';
import type { SiteTheme } from '@openfactu/site-builder';
import { fontOptionFor, googleFontsUrl, useTheme } from '@/context/ThemeContext';
import type { WebsiteSite } from '../domain/website';

/**
 * Compone el SiteTheme del editor igual que lo hace el server al servir la
 * web (branding del tenant + overrides del site), para que el canvas del
 * editor pinte exactamente lo mismo que la página publicada.
 */
export function useSiteTheme(site: WebsiteSite | null): SiteTheme {
  const { branding } = useTheme();
  return useMemo(() => {
    const overrides = site?.themeOverrides ?? {};
    const font = fontOptionFor(overrides.fontId ?? branding.fontFamily);
    return {
      colorPrimary: overrides.colorPrimary ?? branding.colorPrimary,
      colorAccent: overrides.colorAccent ?? branding.colorAccent,
      fontFamily: font.sans,
      fontImportUrl: googleFontsUrl(font) ?? undefined,
      logoUrl: overrides.logoUrl ?? branding.logoUrl ?? undefined,
      siteName: site?.name ?? branding.appName,
    };
  }, [site, branding]);
}
