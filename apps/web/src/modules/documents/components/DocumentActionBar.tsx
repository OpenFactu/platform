import React from 'react';
import { Button } from '@openfactu/ui';
import { Trash2, Tag, Mail, type LucideIcon } from 'lucide-react';
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onCancel && showCancel && (
        <Button
          variant="outline"
          onClick={onCancel}
          isLoading={isCancelling}
          className="h-10 gap-2 border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:border-rose-300 dark:hover:border-rose-500/50"
        >
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
          className="inline-flex items-center gap-1.5 h-10 px-3 text-xs font-bold rounded-lg border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/50"
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
      {primary && PrimaryIcon && (
        <Button
          onClick={primary.onClick}
          disabled={primary.disabled}
          isLoading={primary.isLoading}
          className="h-10 gap-2"
        >
          <PrimaryIcon size={16} />
          <span>{primary.label}</span>
        </Button>
      )}
    </div>
  );
};
