import React from 'react';
import { ExternalLink, Lock } from 'lucide-react';
import { Button } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { canRead } from '@/modules/permissions';
import { DOCUMENTS, documentLabel, type DocumentRef } from '../domain/messaging';

/**
 * Botón para abrir un documento del ERP compartido en el chat.
 *
 * El mensaje solo lleva tipo, id y número. Si quien lo mira no tiene permiso
 * sobre ese tipo de documento, el botón queda deshabilitado; y aunque lo
 * forzara, la ficha la sirve el ERP, que vuelve a comprobarlo.
 */
export const DocumentCard: React.FC<{ doc: DocumentRef }> = ({ doc }) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const { openTab } = useTabs();
  const meta = DOCUMENTS[doc.docType];
  const allowed = canRead(user, meta.permission);

  return (
    <Button
      size="sm"
      variant="soft"
      disabled={!allowed}
      title={allowed ? undefined : t('messaging.documents.restricted')}
      onClick={() => openTab(`${meta.route}/${doc.id}`, { title: documentLabel(doc, t) })}
    >
      {allowed ? <ExternalLink size={14} /> : <Lock size={14} />}
      {allowed
        ? `${t('messaging.documents.open')} ${documentLabel(doc, t)}`
        : t('messaging.documents.restricted')}
    </Button>
  );
};
