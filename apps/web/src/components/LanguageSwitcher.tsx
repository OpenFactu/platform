import React from 'react';
import { SegmentedControl, useToast } from '@openfactu/ui';
import { useI18n, type Locale } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useLocalization } from '@/context/LocalizationContext';
import { authApi } from '@/shared/api';
import { t as tNow } from '@/i18n/i18n';

/** Nombre de un idioma en ese mismo idioma, para reconocerlo aunque no se lea el actual. */
function languageName(code: string): string {
  if (code === 'es') return 'Español';
  if (code === 'en') return 'English';
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

/**
 * Selector de idioma: los de la aplicación y los que aporten los plugins activos.
 * Con sesión iniciada, el idioma se guarda en el perfil del
 * usuario (le sigue en cualquier dispositivo); sin sesión, solo en el navegador.
 */
export const LanguageSwitcher: React.FC<{ className?: string; fullWidth?: boolean }> = ({
  className,
  fullWidth,
}) => {
  const { locale, setLocale, t } = useI18n();
  const { isAuthenticated } = useAuth();
  const { info } = useLocalization();
  const toast = useToast();
  // El actual siempre aparece: sin sesión no se sabe qué idiomas aportan los plugins.
  const languages = [...new Set(['es', 'en', ...(info?.languages ?? []), locale])];

  const change = (l: Locale) => {
    setLocale(l);
    if (isAuthenticated) {
      // `tNow`: el `t` del render aún es el del idioma anterior.
      authApi.saveLocale(l).catch(() => toast.error(tNow('common.languageSaveError')));
    }
  };

  return (
    <SegmentedControl<Locale>
      size="sm"
      variant="raised"
      fullWidth={fullWidth}
      className={className}
      aria-label={t('common.language')}
      value={locale}
      onChange={change}
      options={languages.map((value) => ({ value, label: languageName(value) }))}
    />
  );
};
