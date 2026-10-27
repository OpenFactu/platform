import React from 'react';
import { AIContextUsage } from '@openfactu/ui/ai';

/**
 * Anillo de "contexto usado" del compositor. `used` es una estimación cliente
 * (~4 car./token) sobre TODO el historial + el borrador; `limit` es el
 * `contextWindow` real si el proveedor es local/Ollama (ver
 * /api/ai/capabilities) o un techo genérico en proveedores cloud.
 */
export const ContextUsageRing: React.FC<{ used: number; limit: number; approx: boolean }> = ({
  used,
  limit,
  approx,
}) => (
  <AIContextUsage
    usedTokens={used}
    maxTokens={limit}
    placement="top"
    align="start"
    details={
      approx ? [{ label: 'Cálculo', value: 'Estimado (~4 caracteres por token)' }] : undefined
    }
  />
);
