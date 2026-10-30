import { coreApi } from '@/shared/api';
import { useCallback, useEffect, useState } from 'react';
import type { AIConversationItem, AIConversationProject } from '@openfactu/ui/ai';

interface ConversationSummary {
  id: string;
  title: string | null;
  model: string | null;
  projectId: string | null;
  updatedAt: string;
}

/**
 * Conversaciones y proyectos guardados del usuario, en el formato de
 * AIConversationHistory. Se recarga al cambiar la conversación activa (se crea
 * o se renombra sola al guardarse tras cada respuesta). Borrar un proyecto no
 * borra sus conversaciones: el servidor las deja sin proyecto.
 */
export function useConversationList(currentId: string | null) {
  const [items, setItems] = useState<AIConversationItem[] | null>(null);
  const [projects, setProjects] = useState<AIConversationProject[]>([]);

  const reload = useCallback(() => {
    coreApi
      .get<ConversationSummary[]>('/api/ai/conversations')
      .catch(() => [] as ConversationSummary[])
      .then((list) =>
        setItems(
          (list ?? []).map((c) => ({
            id: c.id,
            title: c.title || 'Conversación',
            projectId: c.projectId ?? undefined,
            updatedAt: c.updatedAt,
          })),
        ),
      )
      .catch(() => setItems([]));
    coreApi
      .get<AIConversationProject[]>('/api/ai/conversation-projects')
      .then((list) => setProjects(Array.isArray(list) ? list : []))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    reload();
  }, [currentId, reload]);

  /** Ejecuta una petición y recarga; los fallos se tragan: la lista se resincroniza igual. */
  const run = useCallback(
    async (method: string, path: string, body?: unknown) => {
      try {
        await coreApi.raw(method, path, body);
      } finally {
        reload();
      }
    },
    [reload],
  );

  return {
    conversations: items ?? [],
    projects,
    loading: items === null,
    reload,
    remove: (id: string) => run('DELETE', `/api/ai/conversations/${id}`),
    rename: (id: string, title: string) => run('PATCH', `/api/ai/conversations/${id}`, { title }),
    move: (id: string, projectId?: string) =>
      run('PATCH', `/api/ai/conversations/${id}`, { projectId: projectId ?? null }),
    createProject: (title: string) => run('POST', '/api/ai/conversation-projects', { title }),
    renameProject: (id: string, title: string) =>
      run('PATCH', `/api/ai/conversation-projects/${id}`, { title }),
    deleteProject: (id: string) => run('DELETE', `/api/ai/conversation-projects/${id}`),
  };
}
