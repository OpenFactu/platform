import React, { useState } from 'react';
import { Button, Modal } from '@openfactu/ui';
import { MoreHorizontal, Trash2, Tag, Mail, type LucideIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { PrintTemplateButton } from '@/modules/document-templates/components/PrintTemplateButton';
import { LabelPrintButton } from '@/modules/document-templates/components/LabelPrintButton';

export interface PrimaryAction {
  label: string;
  onClick: () => void;
  icon: LucideIcon;
  disabled?: boolean;
  isLoading?: boolean;
}

interface Props {
  docType: string;
  pdfUrl: string;
  /**
   * Si se le pasa, aparece un botón "Etiqueta" que abre el modal de impresión
   * de etiquetas FREE pasando `{ docId }` como placeholder. La plantilla FREE
   * puede usar `:docId` en sus queries para leer los datos del documento.
   */
  docId?: string;
  /**
   * Texto del documento para imprimir como código de barras directamente
   * (cuando la etiqueta no necesita una query — ej. el código del albarán).
   * Se envía como `params.docCode` además del `docId`.
   */
  docCode?: string;
  onCancel?: () => void;
  showCancel?: boolean;
  cancelLabel?: string;
  isCancelling?: boolean;
  primary?: PrimaryAction;
  /** Si se provee, muestra botón "Enviar" que abre el modal de email. */
  onSendEmail?: () => void;
}

export const DocumentActionBar: React.FC<Props> = ({
  docType,
  pdfUrl,
  docId,
  docCode,
  onCancel,
  showCancel = true,
  cancelLabel = 'Cancelar',
  isCancelling,
  primary,
  onSendEmail,
}) => {
  const PrimaryIcon = primary?.icon;
  const mobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryButton = (className: string) =>
    primary && PrimaryIcon ? (
      <Button
        onClick={primary.onClick}
        disabled={primary.disabled}
        isLoading={primary.isLoading}
        className={className}
      >
        <PrimaryIcon size={16} />
        <span>{primary.label}</span>
      </Button>
    ) : null;

  const others = (
    <>
      {onCancel && showCancel && (
        <Button variant="danger" onClick={onCancel} isLoading={isCancelling} className="h-10 gap-2">
          <Trash2 size={16} />
          <span>{cancelLabel}</span>
        </Button>
      )}
      {docId && (
        <LabelPrintButton
          params={{ docId, ...(docCode ? { docCode } : {}) }}
          title="Imprimir etiqueta del documento"
          variant="full"
          triggerLabel={
            <>
              <Tag size={14} />
              <span>Etiqueta</span>
            </>
          }
          className="h-10 gap-2"
        />
      )}
      <PrintTemplateButton docType={docType} pdfUrl={pdfUrl} variant="secondary" />
      {onSendEmail && (
        <Button
          variant="outline"
          onClick={onSendEmail}
          className="h-10 gap-2 border-accent/30 text-accent hover:bg-accent/5"
          title="Enviar por email con PDF adjunto"
        >
          <Mail size={14} />
          <span>Enviar</span>
        </Button>
      )}
    </>
  );

  // Móvil: la acción principal a ancho completo y el resto tras «Más», en una
  // hoja inferior, en vez de dos filas de botones bajo el título.
  if (mobile) {
    return (
      <div className="flex w-full items-center gap-2">
        {primaryButton('h-11 flex-1 gap-2')}
        <Button
          type="button"
          variant="secondary"
          className={primary ? 'h-11 gap-2' : 'h-11 flex-1 gap-2'}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={16} />
          <span>{primary ? 'Más' : 'Acciones'}</span>
        </Button>
        <Modal
          isOpen={moreOpen}
          onClose={() => setMoreOpen(false)}
          title="Acciones"
          size="sm"
          hideCancel
        >
          <div className="flex flex-col gap-2 [&_button]:h-11 [&_button]:w-full [&_button]:justify-start">
            {others}
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {others}
      {primaryButton('h-10 gap-2')}
    </div>
  );
};
