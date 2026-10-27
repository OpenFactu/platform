import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { AIConversationHistory } from '@openfactu/ui/ai';

interface ConversationSummary {
  id: string;
  title: string | null;
  model: string | null;
  updatedAt: string;
}

/** Sidebar de conversaciones para el modo pantalla completa — estilo ChatGPT
 * (lista siempre visible en vez del popup "Historial" del modo embebido).
 * Lo pinta `AIConversationHistory`, que ya trae buscador, y pide confirmación
 * antes de borrar. */
export const ConversationSidebar: React.FC<{
  headers: Record<string, string>;
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}> = ({ currentId, onSelect, onNew }) => {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);

  const load = () => {
    coreApi
      .get('/api/ai/conversations')
      .catch(() => [])
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const remove = async (id: string) => {
    await coreApi.raw('DELETE', `/api/ai/conversations/${id}`);
    load();
  };

  return (
    <div className="w-64 shrink-0 h-full">
      <AIConversationHistory
        className="h-full"
        loading={items === null}
        conversations={(items ?? []).map((c) => ({
          id: c.id,
          title: c.title || 'Conversación',
          updatedAt: c.updatedAt,
        }))}
        value={currentId ?? undefined}
        onSelect={onSelect}
        onNew={onNew}
        onDelete={(id) => void remove(id)}
      />
    </div>
  );
};
