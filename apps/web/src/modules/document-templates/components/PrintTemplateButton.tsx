import { templatesApi } from '@/modules/document-templates/api';
import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  DropdownMenu,
  List,
  ListItem,
  Modal,
  type ButtonProps,
  useToast,
} from '@openfactu/ui';
import { Download, ChevronDown, FileCode } from 'lucide-react';
import { downloadPdf } from '@/utils/downloadPdf';
import { useI18n } from '@/i18n/I18nContext';

interface Template {
  id: string;
  name: string;
  docType: string;
  isDefault: boolean;
}

/**
 * Plantillas PDF de un tipo de documento y su descarga. Lo comparten el botón
 * de escritorio (desplegable) y el botón flotante de móvil (modal).
 */
export function usePdfTemplates(docType: string, pdfUrl: string) {
  const toast = useToast();
  const { t } = useI18n();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const ensure = async (): Promise<Template[]> => {
    if (templates) return templates;
    setLoading(true);
    try {
      const data = (await templatesApi.list(docType)) as unknown as Template[];
      setTemplates(data);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const download = async (templateId?: string) => {
    setDownloading(true);
    try {
      const url = templateId ? `${pdfUrl}?templateId=${encodeURIComponent(templateId)}` : pdfUrl;
      await downloadPdf(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('templates.printPdf.downloadError'));
    } finally {
      setDownloading(false);
    }
  };

  /** Con una plantilla (o ninguna) descarga y devuelve `null`; con varias, la lista para elegir. */
  const start = async (): Promise<Template[] | null> => {
    try {
      const list = await ensure();
      if (list.length <= 1) {
        await download(list[0]?.id);
        return null;
      }
      return list;
    } catch {
      toast.error(t('templates.printPdf.loadError'));
      return null;
    }
  };

  return { templates, loading, downloading, ensure, download, start };
}

/** Lista de plantillas en un modal: la elección del PDF en móvil. */
export const PdfTemplatePickerModal: React.FC<{
  templates: Template[] | null;
  isOpen: boolean;
  onClose: () => void;
  onPick: (templateId: string) => void;
}> = ({ templates, isOpen, onClose, onPick }) => {
  const { t } = useI18n();
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('templates.printPdf.pickTitle')}
      size="sm"
      hideCancel
    >
      <List>
        {(templates ?? []).map((tpl) => (
          <ListItem
            key={tpl.id}
            icon={<FileCode size={16} />}
            title={tpl.name}
            badge={
              tpl.isDefault ? (
                <Badge variant="info">{t('templates.printPdf.default')}</Badge>
              ) : undefined
            }
            onClick={() => {
              onClose();
              onPick(tpl.id);
            }}
          />
        ))}
      </List>
    </Modal>
  );
};

interface Props {
  /** docType del documento. Ej: 'SINV', 'PINV', 'SDN', 'PDN', 'SO', 'PO'. */
  docType: string;
  /** URL base del endpoint PDF, sin query string. Ej: /api/sales/invoices/123/pdf */
  pdfUrl: string;
  /** Texto opcional del botón. */
  label?: string;
  /** Clase opcional. */
  className?: string;
  /** Variant del botón. Por defecto secundario (neutro). */
  variant?: ButtonProps['variant'];
}

/**
 * Descarga del PDF. Con una sola plantilla descarga directamente; con varias,
 * el primer clic las carga y despliega un `DropdownMenu` para elegir. Antes el
 * desplegable era un `absolute` hecho a mano y se recortaba dentro de un modal.
 */
export const PrintTemplateButton: React.FC<Props> = ({
  docType,
  pdfUrl,
  label = 'PDF',
  className,
  variant = 'secondary',
}) => {
  const { t } = useI18n();
  const pdf = usePdfTemplates(docType, pdfUrl);
  // Se cargan al montar para saber ya en el primer clic si hay que elegir.
  const { ensure } = pdf;
  useEffect(() => {
    ensure().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docType]);
  const multiple = !!pdf.templates && pdf.templates.length > 1;

  const button = (
    <Button
      onClick={multiple ? undefined : () => void pdf.start()}
      variant={variant}
      isLoading={pdf.downloading || pdf.loading}
      className="flex items-center gap-2 h-10"
    >
      <Download size={16} />
      <span>{label}</span>
      {multiple && <ChevronDown size={14} className="opacity-70" />}
    </Button>
  );

  if (!multiple) return <div className={`inline-block ${className || ''}`}>{button}</div>;

  return (
    <DropdownMenu
      className={className}
      align="end"
      items={pdf.templates!.map((tpl) => ({
        label: tpl.isDefault ? t('templates.printPdf.defaultSuffix', { name: tpl.name }) : tpl.name,
        icon: <FileCode size={14} />,
        onClick: () => void pdf.download(tpl.id),
      }))}
    >
      {button}
    </DropdownMenu>
  );
};
