import { templatesApi } from '@/modules/document-templates/api';
import React, { useEffect, useRef, useState } from 'react';
import { Button, type ButtonProps, useToast } from '@openfactu/ui';
import { Download, ChevronDown, FileCode } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { downloadPdf } from '@/utils/downloadPdf';

interface Template {
  id: string;
  name: string;
  docType: string;
  isDefault: boolean;
}

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

export const PrintTemplateButton: React.FC<Props> = ({
  docType,
  pdfUrl,
  label = 'PDF',
  className,
  variant = 'secondary',
}) => {
  const { token, user } = useAuth();
  const toast = useToast();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const ensureTemplates = async (): Promise<Template[]> => {
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

  const doDownload = async (templateId?: string) => {
    setDownloading(true);
    try {
      const url = templateId ? `${pdfUrl}?templateId=${encodeURIComponent(templateId)}` : pdfUrl;
      await downloadPdf(url);
    } catch (e: any) {
      toast.error(e.message || 'Error al descargar PDF');
    } finally {
      setDownloading(false);
      setOpen(false);
    }
  };

  const handleClick = async () => {
    try {
      const list = await ensureTemplates();
      if (list.length <= 1) {
        await doDownload(list[0]?.id);
        return;
      }
      setOpen((o) => !o);
    } catch {
      toast.error('No se pudieron cargar las plantillas');
    }
  };

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className || ''}`}>
      <Button
        onClick={handleClick}
        variant={variant}
        isLoading={downloading || loading}
        className="flex items-center gap-2 h-10"
      >
        <Download size={16} />
        <span>{label}</span>
        {templates && templates.length > 1 && <ChevronDown size={14} className="opacity-70" />}
      </Button>

      {open && templates && templates.length > 1 && (
        <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Elige una plantilla
            </p>
          </div>
          <ul className="max-h-72 overflow-auto">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => doDownload(t.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <FileCode size={14} className="text-slate-400 dark:text-slate-500" />
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-200 truncate">
                    {t.name}
                  </span>
                  {t.isDefault && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
