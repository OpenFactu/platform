import React, { useState } from 'react';
import { Button, type FloatingAction } from '@openfactu/ui';
import { Download, Trash2, Tag, Mail, type LucideIcon } from 'lucide-react';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useI18n } from '@/i18n/I18nContext';
import { useMobilePageActions } from '@/context/MobilePageActionsContext';
import {
  PdfTemplatePickerModal,
  PrintTemplateButton,
  usePdfTemplates,
} from '@/modules/document-templates/components/PrintTemplateButton';
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
  cancelLabel: cancelLabelProp,
  isCancelling,
  primary,
  onSendEmail,
}) => {
  const { t } = useI18n();
  const cancelLabel = cancelLabelProp ?? t('doc.common.cancel');
  const PrimaryIcon = primary?.icon;
  const mobile = useIsMobile();
  const pdf = usePdfTemplates(docType, pdfUrl);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);

  // Móvil: todo al botón flotante de la pantalla (MobileBottomNav). La acción
  // principal va aparte para quedar la última, junto al pulgar, y cancelar la
  // primera, lejos de él.
  const mobileActions: FloatingAction[] = [
    ...(onCancel && showCancel
      ? [{ id: 'cancel', label: cancelLabel, icon: <Trash2 size={19} />, onClick: onCancel }]
      : []),
    ...(docId
      ? [
          {
            id: 'label',
            label: t('doc.lines.label'),
            icon: <Tag size={19} />,
            onClick: () => setLabelOpen(true),
          },
        ]
      : []),
    {
      id: 'pdf',
      label: t('doc.actions.downloadPdf'),
      icon: <Download size={19} />,
      onClick: async () => {
        if (await pdf.start()) setPickerOpen(true);
      },
    },
    ...(onSendEmail
      ? [
          {
            id: 'email',
            label: t('doc.actions.sendByEmail'),
            icon: <Mail size={19} />,
            onClick: onSendEmail,
          },
        ]
      : []),
  ];
  useMobilePageActions('document:bar', mobileActions, mobile);
  useMobilePageActions(
    'primary:bar',
    primary && PrimaryIcon
      ? [
          {
            id: 'primary',
            label: primary.label,
            icon: <PrimaryIcon size={19} />,
            onClick: primary.onClick,
            disabled: primary.disabled || primary.isLoading,
          },
        ]
      : [],
    mobile,
  );

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
          title={t('doc.actions.printDocLabel')}
          variant="full"
          triggerLabel={
            <>
              <Tag size={14} />
              <span>{t('doc.lines.label')}</span>
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
          title={t('doc.actions.sendWithPdf')}
        >
          <Mail size={14} />
          <span>{t('doc.actions.send')}</span>
        </Button>
      )}
    </>
  );

  if (mobile) {
    return (
      <>
        <PdfTemplatePickerModal
          templates={pdf.templates}
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(id) => void pdf.download(id)}
        />
        {docId && (
          <LabelPrintButton
            params={{ docId, ...(docCode ? { docCode } : {}) }}
            hideTrigger
            open={labelOpen}
            onOpenChange={setLabelOpen}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {others}
      {primaryButton('h-10 gap-2')}
    </div>
  );
};
