import React from 'react';
import { Button } from '@openfactu/ui';
import { Copy, ClipboardPaste } from 'lucide-react';
import { useDocumentClone, type CloneDocType } from '../../hooks/useDocumentClone';

interface Props {
  docType: CloneDocType;
  /** En la vista de detalle: documento a copiar. */
  doc?: any;
  /** En la vista de listado: callback cuando se pega. Recibe { header, lines }. */
  onPaste?: (payload: { header: any; lines: any[] }) => void | Promise<void>;
  /** Qué botones mostrar. Por defecto ambos. */
  show?: 'copy' | 'paste' | 'both';
  /** Tamaño de los iconos. */
  size?: number;
}

/**
 * Botones de Copiar/Pegar documento. Úsalo en:
 *  - Detalle: `<CloneDocumentActions docType="SINV" doc={invoice} show="copy" />`
 *  - Listado: `<CloneDocumentActions docType="SINV" onPaste={async (p) => { await docsApi.create(...) }} show="paste" />`
 */
export const CloneDocumentActions: React.FC<Props> = ({
  docType,
  doc,
  onPaste,
  show = 'both',
  size = 16,
}) => {
  const clone = useDocumentClone(docType);
  const showCopy = (show === 'both' || show === 'copy') && !!doc;
  const showPaste = (show === 'both' || show === 'paste') && !!onPaste;

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {showCopy && (
        <Button
          variant="secondary"
          onClick={() => clone.copy(doc)}
          className="flex items-center gap-2 whitespace-nowrap"
          title="Copiar al portapapeles para duplicar en otro listado"
        >
          <Copy size={size} />
          Copiar
        </Button>
      )}
      {showPaste && (
        <Button
          variant="secondary"
          onClick={async () => {
            const data = await clone.read();
            if (data) await onPaste?.(data);
          }}
          className="flex items-center gap-2 whitespace-nowrap"
          title="Pegar documento copiado → se crea un duplicado en borrador"
        >
          <ClipboardPaste size={size} />
          Pegar
        </Button>
      )}
    </div>
  );
};
