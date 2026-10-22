/**
 * Botón + modal para imprimir etiquetas a partir de plantillas LABEL.
 *
 * Flujo:
 *  1. Lista las plantillas con docType=LABEL del tenant.
 *  2. Muestra la plantilla predeterminada en el selector del modal.
 *  3. Permite indicar nº de copias y abre el PDF resultante en una pestaña
 *     nueva (responsabilidad del navegador imprimirlo).
 *
 * El componente recibe `params` (objeto plano) que se reenvía al endpoint
 * `POST /api/document-templates/:id/render-free` como placeholders SQL
 * disponibles en las queries de la plantilla — típicamente `{ itemId }`.
 */

import { templatesApi } from '@/modules/document-templates/api';
import { apiClient } from '@/shared/http';
import React, { useEffect, useState } from 'react';
import { Modal, Button, Select, NumberInput } from '@openfactu/ui';
import { Tag, Printer } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface FreeTemplate {
  id: string;
  name: string;
  isDefault: boolean;
}

interface Props {
  /** Parámetros que se enviarán como placeholders SQL (`:itemId`, etc.). */
  params: Record<string, unknown>;
  /** Texto del tooltip / aria-label del botón. */
  title?: string;
  /** Si se le pasa, sustituye al botón estándar y se renderiza con este nodo (para usar dentro de un dropdown, etc.). */
  triggerLabel?: React.ReactNode;
  /** Variante visual: `icon` (botón compacto solo icono) o `full` (icono + texto). Por defecto `icon`. */
  variant?: 'icon' | 'full';
  /** className extra para el botón. */
  className?: string;
}

export const LabelPrintButton: React.FC<Props> = ({
  params,
  title = 'Imprimir etiqueta',
  triggerLabel,
  variant = 'icon',
  className,
}) => {
  const { token, user } = useAuth();
  const tenantId = user?.tenantId;
  const navigate = useNavigate();
  const canOpenTemplates =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPERUSER' ||
    !!user?.permissions?.['/document-templates']?.read;
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<FreeTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [copies, setCopies] = useState<number>(1);
  const [printing, setPrinting] = useState(false);

  // Refetch on each opening, including after creating the first label template.
  useEffect(() => {
    if (!open || templates !== null) return;
    let active = true;
    (async () => {
      try {
        const list = (await templatesApi.list('LABEL')) as unknown as FreeTemplate[];
        if (!active) return;
        setTemplates(list);
        const def = list.find((t) => t.isDefault) ?? list[0];
        setSelectedId(def?.id ?? '');
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'No se pudieron cargar las plantillas');
      }
    })();
    return () => {
      active = false;
    };
  }, [open, templates, token, tenantId]);

  const doPrint = async () => {
    if (!selectedId) return;
    setPrinting(true);
    setError(null);
    try {
      const { blob } = await apiClient.postBlob(
        `/api/document-templates/${selectedId}/render-free`,
        { params, copies },
      );
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        // Bloqueado por popups: ofrecemos descarga directa como fallback.
        const a = document.createElement('a');
        a.href = url;
        a.download = 'etiqueta.pdf';
        a.click();
      }
      // Liberamos el blob tras un margen para que el navegador lo cargue.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al imprimir');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setTemplates(null);
          setSelectedId('');
          setError(null);
          setOpen(true);
        }}
        title={title}
        className={className || (variant === 'full' ? '' : 'h-7 w-7 p-0')}
      >
        {triggerLabel ?? (
          <>
            <Tag size={variant === 'full' ? 13 : 14} />
            {variant === 'full' && <span>Etiqueta</span>}
          </>
        )}
      </Button>

      {/* El Modal del paquete ya trae portal, backdrop, cierre al pulsar fuera
          y el pie de botones; antes esto era un createPortal a mano con el
          overlay en slate-900/70 fijo. */}
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Imprimir etiqueta"
        size="md"
        isBusy={printing}
        closeOnOverlayClick
        footer={
          <Modal.Footer className="flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={printing}
              onClick={() => setOpen(false)}
            >
              {templates?.length ? 'Cancelar' : 'Cerrar'}
            </Button>
            {templates?.length === 0 && canOpenTemplates && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  navigate('/document-templates');
                }}
              >
                Ver plantillas
              </Button>
            )}
            {!!templates?.length && (
              <Button
                type="button"
                size="sm"
                onClick={doPrint}
                disabled={!selectedId || printing}
                isLoading={printing}
              >
                <Printer size={13} />
                {printing ? 'Generando…' : 'Imprimir'}
              </Button>
            )}
          </Modal.Footer>
        }
      >
        <div className="space-y-3 text-sm">
          {!templates && !error && (
            <div role="status" className="text-fg-muted">
              Cargando plantillas…
            </div>
          )}
          {templates && templates.length === 0 && (
            <div className="space-y-2">
              <p className="font-medium text-fg-body">Todavía no hay plantillas de etiquetas</p>
              <p className="text-fg-muted leading-relaxed">
                {canOpenTemplates
                  ? 'Para imprimir, necesitas una plantilla de tipo «Etiqueta libre». Puedes configurarla en Plantillas PDF.'
                  : 'Pide a un administrador que configure una plantilla de tipo «Etiqueta libre» en Plantillas PDF.'}
              </p>
            </div>
          )}
          {templates && templates.length > 0 && (
            <>
              <Select
                label="Plantilla"
                value={selectedId}
                onChange={setSelectedId}
                options={templates.map((t) => ({
                  value: t.id,
                  label: `${t.name}${t.isDefault ? ' (predeterminada)' : ''}`,
                }))}
              />
              {/* El recorte a [1, 200] lo hace ya el propio NumberInput al salir
                  del campo; aquí solo se cubre el caso de dejarlo vacío. */}
              <NumberInput
                label="Copias"
                min={1}
                max={200}
                value={copies}
                onChange={(v) => setCopies(v ?? 1)}
                containerClassName="w-24"
              />
            </>
          )}
          {error && (
            <div role="alert" className="text-danger-fg whitespace-pre-wrap">
              {error}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
