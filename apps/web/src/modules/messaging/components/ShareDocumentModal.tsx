import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  List,
  Modal,
  SearchInput,
  useChatActions,
  useDebouncedValue,
  type ListItemData,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { formatCurrency, formatDate } from '@/i18n/format';
import { erpApi, messagingApi } from '../api/messagingApi';
import { mapMessage } from '../api/messageCache';
import { messagingErrorText } from '../domain/errors';
import { SEARCH_SECTIONS, documentLabel, type DocumentRef } from '../domain/messaging';

interface Hit {
  id: string;
  docCode: string;
  partnerName: string;
  date: string;
  total: number;
}

/**
 * Busca un documento con el buscador global del ERP (que ya recorta lo que el
 * usuario no puede ver) y lo comparte en la conversación.
 */
export const ShareDocumentModal: React.FC<{
  onClose: () => void;
  conversationId: string;
}> = ({ onClose, conversationId }) => {
  const { t } = useI18n();
  const actions = useChatActions();
  const [term, setTerm] = useState('');
  const debounced = useDebouncedValue(term, 250);
  // Resultados de la última búsqueda, con el término al que responden.
  const [result, setResult] = useState<{ term: string; hits: { doc: DocumentRef; hit: Hit }[] }>({
    term: '',
    hits: [],
  });
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = debounced.trim();
  const searching = q.length >= 2;
  const loading = searching && result.term !== q;
  const hits = searching && !loading ? result.hits : [];

  useEffect(() => {
    if (!searching) return;
    let cancelled = false;
    erpApi
      .search(q)
      .then((res) =>
        SEARCH_SECTIONS.flatMap(({ key, docType }) =>
          ((res[key] as Hit[] | undefined) ?? []).map((hit) => ({
            doc: { docType, id: hit.id, number: hit.docCode },
            hit,
          })),
        ),
      )
      .catch(() => [])
      .then((found) => {
        if (!cancelled) setResult({ term: q, hits: found });
      });
    return () => {
      cancelled = true;
    };
  }, [q, searching]);

  const share = async (doc: DocumentRef) => {
    setSending(doc.id);
    setError(null);
    try {
      const dto = await messagingApi.sendDocument(conversationId, doc, crypto.randomUUID());
      actions.receiveMessages([mapMessage(dto, t)]);
      onClose();
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setSending(null);
    }
  };

  const items: ListItemData[] = hits.map(({ doc, hit }) => ({
    id: `${doc.docType}:${doc.id}`,
    icon: <FileText size={16} />,
    title: documentLabel(doc, t),
    subtitle: hit.partnerName,
    meta: `${formatDate(hit.date)} · ${formatCurrency(hit.total)}`,
    disabled: Boolean(sending),
    onClick: () => void share(doc),
  }));

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('messaging.documents.shareTitle')}
      size="md"
      isBusy={Boolean(sending)}
      error={error}
      hideCancel
    >
      <div className="flex flex-col gap-3">
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder={t('messaging.documents.searchPlaceholder')}
          autoFocus
          clearable
        />
        {!searching ? (
          <p className="text-sm text-fg-muted">{t('messaging.documents.minChars')}</p>
        ) : !loading && items.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('messaging.documents.noResults')}</p>
        ) : (
          <List items={items} isLoading={loading} skeletonCount={3} density="compact" />
        )}
      </div>
    </Modal>
  );
};
