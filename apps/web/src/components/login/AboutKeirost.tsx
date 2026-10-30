import React from 'react';
import { GradientText, Highlight, TextReveal, cn } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Qué es Keirost, para la pantalla de acceso: titular y un párrafo, con los
 * efectos de texto de @openfactu/ui como escaparate de la librería: el titular
 * entra palabra a palabra (TextReveal) y remata con un degradado animado
 * (GradientText); en el párrafo, un subrayado de marcador (Highlight).
 *
 * Se pinta en el panel de marca del login (escritorio, `tone="brand"`, sobre el
 * color primario) y en la hoja «¿Qué es Keirost?» del móvil (`tone="surface"`).
 */
export const AboutKeirost: React.FC<{ tone?: 'brand' | 'surface'; className?: string }> = ({
  tone = 'surface',
  className,
}) => {
  const brand = tone === 'brand';
  const { t } = useI18n();
  return (
    <div className={cn('space-y-4', className)}>
      <h2
        className={cn(
          'font-display font-bold leading-[1.1] tracking-tight',
          brand ? 'text-4xl xl:text-5xl !text-primary-fg' : 'text-2xl text-fg-default',
        )}
      >
        <TextReveal text={t('app.about.headline1')} by="word" />{' '}
        <GradientText
          animated
          // Sobre el primario, en tonos del propio texto del panel: con el acento
          // (que a menudo es del mismo color que el primario) el final se perdía.
          from={brand ? 'rgb(var(--color-primary-fg-rgb))' : undefined}
          to={brand ? 'rgb(var(--color-primary-fg-rgb) / 0.55)' : undefined}
        >
          {t('app.about.headline2')}
        </GradientText>
      </h2>
      <p
        className={cn(
          'leading-relaxed',
          brand ? 'text-base text-primary-fg/75' : 'text-sm text-fg-muted',
        )}
      >
        {t('app.about.bodyBefore')} <Highlight>{t('app.about.bodyHighlight')}</Highlight>{' '}
        {t('app.about.bodyAfter')}
      </p>
    </div>
  );
};
