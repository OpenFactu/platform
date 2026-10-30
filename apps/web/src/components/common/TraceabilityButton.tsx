import React from 'react';
import { Button, usePopup } from '@openfactu/ui';
import { Network } from 'lucide-react';
import { TraceabilityPopupBody } from './TraceabilityPopupBody';
import { DocType } from '@openfactu/common';
import { ResponsiveActions } from './ResponsiveActions';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  type: DocType;
  id: string;
  docCode?: string;
  /** Compacto (solo icono). */
  iconOnly?: boolean;
}

/**
 * Botón "Trazabilidad" que abre un popup grande con la cadena completa de
 * documentos relacionados (pedido → albarán → factura → cobro → asiento),
 * siempre accesible aunque no haya relaciones todavía.
 */
export const TraceabilityButton: React.FC<Props> = ({ type, id, docCode, iconOnly }) => {
  const popup = usePopup();
  const { t } = useI18n();

  const open = () => {
    popup.show({
      title: `${t('app.trace.title')}${docCode ? ` · ${docCode}` : ''}`,
      subtitle: t('app.trace.subtitle'),
      maxWidth: '5xl',
      render: (close) => (
        <TraceabilityPopupBody type={type} id={id} currentCode={docCode} onNavigated={close} />
      ),
    });
  };

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={open}
        title={t('app.trace.view')}
        className="h-9 w-9 justify-center px-0"
      >
        <Network size={16} />
      </Button>
    );
  }

  // La versión completa es la de la ficha: en móvil va al botón flotante.
  return (
    <ResponsiveActions
      source="secondary:traceability"
      actions={[
        { id: 'trace', label: t('app.trace.title'), icon: <Network size={19} />, onClick: open },
      ]}
    >
      <Button
        variant="secondary"
        onClick={open}
        className="flex items-center gap-2 whitespace-nowrap"
      >
        <Network size={16} />
        {t('app.trace.title')}
      </Button>
    </ResponsiveActions>
  );
};
