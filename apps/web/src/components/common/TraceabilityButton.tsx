import React from 'react';
import { Button, usePopup } from '@openfactu/ui';
import { Network } from 'lucide-react';
import { TraceabilityPopupBody } from './TraceabilityPopupBody';

type DocType = 'SO' | 'PO' | 'SDN' | 'PDN' | 'SINV' | 'PINV';

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

  const open = () => {
    popup.show({
      title: `Trazabilidad${docCode ? ` · ${docCode}` : ''}`,
      subtitle: 'Cadena completa de documentos relacionados.',
      maxWidth: '5xl',
      render: (close) => (
        <TraceabilityPopupBody type={type} id={id} currentCode={docCode} onNavigated={close} />
      ),
    });
  };

  if (iconOnly) {
    return (
      <button
        onClick={open}
        title="Ver trazabilidad"
        className="h-9 w-9 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Network size={16} />
      </button>
    );
  }

  return (
    <Button
      variant="secondary"
      onClick={open}
      className="flex items-center gap-2 whitespace-nowrap"
    >
      <Network size={16} />
      Trazabilidad
    </Button>
  );
};
