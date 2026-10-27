/**
 * Render de Markdown para los mensajes del asistente de IA.
 *
 * Lo pinta `AIMarkdown` de @openfactu/ui/ai: tablas con scroll, bloques de
 * código con copiar, enlaces y medios con URL saneada e imagen de reserva si
 * falla la carga.
 */

import React from 'react';
import { AIMarkdown } from '@openfactu/ui/ai';

export const Markdown: React.FC<{ children: string }> = ({ children }) => (
  <AIMarkdown>{children}</AIMarkdown>
);
