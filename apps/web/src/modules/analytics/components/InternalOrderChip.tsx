import { internalOrdersApi } from '@/modules/analytics/api';
import React, { useEffect, useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Props {
  internalOrderId: string | null | undefined;
}

/**
 * Chip que muestra el proyecto/orden interna asociado a un documento.
 * Resuelve code+name buscando en `/api/internal-orders` (cacheado por
 * sesión vía `Map` en módulo). Si no hay id, no renderiza nada.
 */
const cache = new Map<string, { code: string; name: string }>();
let allFetched = false;

export const InternalOrderChip: React.FC<Props> = ({ internalOrderId }) => {
  const { token, user } = useAuth();
  const [info, setInfo] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => {
    if (!internalOrderId) return;
    if (cache.has(internalOrderId)) {
      setInfo(cache.get(internalOrderId)!);
      return;
    }
    if (allFetched) return;
    if (!token || !user?.tenantId) return;
    internalOrdersApi
      .list()
      .catch(() => [])
      .then((d) => {
        for (const io of d) cache.set(io.id, { code: io.code, name: io.name });
        allFetched = true;
        const found = cache.get(internalOrderId);
        if (found) setInfo(found);
      })
      .catch(() => {});
  }, [internalOrderId, token, user?.tenantId]);

  if (!internalOrderId || !info) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200 text-xs font-medium">
      <FolderKanban size={12} />
      <span className="font-mono">{info.code}</span>
      <span className="text-indigo-500">— {info.name}</span>
    </span>
  );
};

export default InternalOrderChip;
