import { coreApi } from '@/shared/api';
import { useCallback, useEffect, useState } from 'react';
import type { AIConversationItem } from '@openfactu/ui/ai';

interface ConversationSummary {
  id: string;
  title: string | null;
  model: string | null;
  updatedAt: string;
}

/**
 * Conversaciones guardadas del usuario, en el formato de AIConversationHistory.
 * Se recarga al cambiar la conversación activa (se crea o se renombra sola al
 * guardarse tras cada respuesta).
 */
export function useConversationList(currentId: string | null) {
  const [items, setItems] = useState<AIConversationItem[] | null>(null);

  const reload = useCallback(() => {
    coreApi
      .get<ConversationSummary[]>('/api/ai/conversations')
      .catch(() => [] as ConversationSummary[])
      .then((list) =>
        setItems(
          (list ?? []).map((c) => ({
            id: c.id,
            title: c.title || 'Conversación',
            updatedAt: c.updatedAt,
          })),
        ),
      )
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    reload();
  }, [currentId, reload]);

  const remove = useCallback(
    async (id: string) => {
      await coreApi.raw('DELETE', `/api/ai/conversations/${id}`);
      reload();
    },
    [reload],
  );

  return { conversations: items ?? [], loading: items === null, reload, remove };
}
