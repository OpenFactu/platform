import React from 'react';
import { SegmentedControl, useToast } from '@openfactu/ui';
import { useI18n, type Locale } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { authApi } from '@/shared/api';
import { t as tNow } from '@/i18n/i18n';

/**
 * Selector ES/EN. Con sesión iniciada, el idioma se guarda en el perfil del
 * usuario (le sigue en cualquier dispositivo); sin sesión, solo en el navegador.
 */
export const LanguageSwitcher: React.FC<{ className?: string; fullWidth?: boolean }> = ({
  className,
  fullWidth,
}) => {
  const { locale, setLocale, t } = useI18n();
  const { isAuthenticated } = useAuth();
  const toast = useToast();

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
      options={[
        { value: 'es', label: 'Español' },
        { value: 'en', label: 'English' },
      ]}
    />
  );
};
