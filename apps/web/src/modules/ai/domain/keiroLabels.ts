import { ASSISTANT_NAME } from './constants';

/**
 * Textos del estado vacío y del asistente para los componentes de @openfactu/ui/ai.
 * Recibe `t` (de `useI18n`) para rehacerse al cambiar de idioma.
 */
export const keiroLabels = (
  t: (path: string, vars?: Record<string, string | number>) => string,
) => ({
  emptyTitle: t('ai.labels.emptyTitle', { name: ASSISTANT_NAME }),
  emptyHint: t('ai.labels.emptyHint'),
  assistant: ASSISTANT_NAME,
});
