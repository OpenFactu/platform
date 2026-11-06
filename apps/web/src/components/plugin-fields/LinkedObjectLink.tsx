import React from 'react';
import { Button } from '@openfactu/ui';
import { ArrowRight } from 'lucide-react';
import { useTabs } from '@/context/TabsContext';
import { useI18n } from '@/i18n/I18nContext';
import { useLinkedValue } from './linkedObjects';

/** La flecha que abre el registro enlazado, como la de SAP. */
export const LinkedObjectArrow: React.FC<{ route?: string }> = ({ route }) => {
  const { t } = useI18n();
  const { openTab } = useTabs();
  if (!route) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={t('app.pluginFields.openLinked')}
      title={t('app.pluginFields.openLinked')}
      onClick={(event) => {
        // Dentro de un listado, la fila también abre lo suyo.
        event.stopPropagation();
        openTab(route);
      }}
    >
      <ArrowRight size={14} />
    </Button>
  );
};

/** El valor de un campo enlazado: su nombre y la flecha, o por qué no se puede ver. */
export const LinkedObjectValue: React.FC<{ objectId?: string | null; value: unknown }> = ({
  objectId,
  value,
}) => {
  const { t } = useI18n();
  const linked = useLinkedValue(objectId, value);

  if (!objectId) return <span className="text-xs text-fg-body">{String(value)}</span>;
  if (!linked) return <span className="text-xs text-fg-subtle">…</span>;
  if (linked.hidden) {
    return <span className="text-xs text-fg-subtle">{t('app.pluginFields.linkedHidden')}</span>;
  }
  if (linked.missing) {
    return <span className="text-xs text-fg-subtle">{t('app.pluginFields.linkedMissing')}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-fg-body">
      <span>{linked.label}</span>
      <LinkedObjectArrow route={linked.route} />
    </span>
  );
};
