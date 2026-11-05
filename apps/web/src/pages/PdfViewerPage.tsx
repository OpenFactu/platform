import React, { useEffect, useRef } from 'react';
import { Button, Card, EmptyState, Loader, useMediaQuery } from '@openfactu/ui';
import { AlertCircle, Download, FileText, Printer } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { usePdfDocument } from '@/hooks/usePdfDocument';
import { saveBlob } from '@/utils/downloadPdf';

/**
 * Pestaña con un documento PDF, para verlo antes de imprimirlo o guardarlo. Va sin el
 * menú del ERP: la abre `openPdf` y recargarla vuelve a pedir el documento.
 */
export const PdfViewerPage: React.FC = () => {
  const { t } = useI18n();
  const src = new URLSearchParams(window.location.search).get('src');
  const { pdf, error, loading } = usePdfDocument(src);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  // Los navegadores de móvil no suelen mostrar un PDF dentro de la página.
  const canEmbed = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    if (pdf) document.title = pdf.filename;
  }, [pdf]);

  const print = () => {
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    frame.focus();
    frame.print();
  };
  const download = () => {
    if (pdf) saveBlob(pdf.blob, pdf.filename);
  };

  if (error !== null) {
    return (
      <div className="min-h-screen bg-bg-app flex items-center justify-center p-4">
        <Card>
          <EmptyState
            icon={<AlertCircle size={18} />}
            title={t('doc.pdfViewer.errorTitle')}
            hint={error || t('doc.pdfViewer.errorHint')}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg-app">
      <header className="flex items-center justify-between gap-3 px-4 py-2 bg-bg-card border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-fg-muted shrink-0" />
          <span className="text-sm font-semibold text-fg-default truncate">
            {pdf?.filename ?? t('doc.pdfViewer.loading')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={download}
            disabled={!pdf}
            className="gap-2"
          >
            <Download size={14} /> {t('doc.pdfViewer.download')}
          </Button>
          {canEmbed && (
            <Button size="sm" onClick={print} disabled={!pdf} className="gap-2">
              <Printer size={14} /> {t('doc.pdfViewer.print')}
            </Button>
          )}
        </div>
      </header>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader />
        </div>
      )}
      {pdf && canEmbed && (
        <iframe
          ref={frameRef}
          title={pdf.filename}
          src={`${pdf.url}#navpanes=0`}
          className="flex-1 w-full border-0"
        />
      )}
      {pdf && !canEmbed && (
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={<FileText size={18} />}
            title={pdf.filename}
            hint={t('doc.pdfViewer.mobileHint')}
          />
        </div>
      )}
    </div>
  );
};

export default PdfViewerPage;
