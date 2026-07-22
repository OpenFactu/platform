import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';

interface ConversationSummary {
  id: string;
  title: string | null;
  model: string | null;
  updatedAt: string;
}

/** Sidebar de conversaciones para el modo pantalla completa — estilo ChatGPT
 * (lista siempre visible en vez del popup "Historial" del modo embebido). */
export const ConversationSidebar: React.FC<{
  headers: Record<string, string>;
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}> = ({ headers, currentId, onSelect, onNew }) => {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);

  const load = () => {
    coreApi.get<any>('/api/ai/conversations')
      .catch(() => ([]))
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await coreApi.raw('DELETE', `/api/ai/conversations/${id}`);
    load();
  };

  return (
    <div className="w-64 shrink-0 flex flex-col h-full">
      <button
        type="button"
        onClick={onNew}
        className="flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors mb-3"
      >
        <Plus size={16} /> Nueva conversación
      </button>
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 pr-1">
        {items === null && <p className="text-xs text-slate-400 italic px-3">Cargando…</p>}
        {items?.length === 0 && (
          <p className="text-xs text-slate-400 italic px-3">Sin conversaciones todavía.</p>
        )}
        {items?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`group w-full flex items-center gap-2 text-left text-sm px-3 py-2 rounded-lg transition-colors ${
              c.id === currentId
                ? 'bg-accent/10 text-accent'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare size={14} className="shrink-0 opacity-60" />
            <span className="flex-1 truncate">{c.title || 'Conversación'}</span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => void remove(c.id, e)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 shrink-0"
              title="Eliminar conversación"
            >
              <Trash2 size={13} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
