import React from 'react';
import { Button } from '@openfactu/ui';
import { Copy, ClipboardPaste } from 'lucide-react';
import { useDocumentClone, type CloneDocType } from '../../hooks/useDocumentClone';
import { ResponsiveActions } from './ResponsiveActions';
import { useI18n } from '@/i18n/I18nContext';

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
  const { t } = useI18n();
  const showCopy = (show === 'both' || show === 'copy') && !!doc;
  const showPaste = (show === 'both' || show === 'paste') && !!onPaste;
  const paste = async () => {
    const data = await clone.read();
    if (data) await onPaste?.(data);
  };

  // En móvil, al botón flotante de la pantalla.
  return (
    <ResponsiveActions
      source="secondary:clone"
      actions={[
        ...(showCopy
          ? [
              {
                id: 'copy',
                label: t('app.clone.copyDocument'),
                icon: <Copy size={19} />,
                onClick: () => clone.copy(doc),
              },
            ]
          : []),
        ...(showPaste
          ? [
              {
                id: 'paste',
                label: t('app.clone.pasteDocument'),
                icon: <ClipboardPaste size={19} />,
                onClick: paste,
              },
            ]
          : []),
      ]}
    >
      <div className="flex items-center gap-2 whitespace-nowrap">
        {showCopy && (
          <Button
            variant="secondary"
            onClick={() => clone.copy(doc)}
            className="flex items-center gap-2 whitespace-nowrap"
            title={t('app.clone.copyHint')}
          >
            <Copy size={size} />
            {t('app.clone.copy')}
          </Button>
        )}
        {showPaste && (
          <Button
            variant="secondary"
            onClick={paste}
            className="flex items-center gap-2 whitespace-nowrap"
            title={t('app.clone.pasteHint')}
          >
            <ClipboardPaste size={size} />
            {t('app.clone.paste')}
          </Button>
        )}
      </div>
    </ResponsiveActions>
  );
};
