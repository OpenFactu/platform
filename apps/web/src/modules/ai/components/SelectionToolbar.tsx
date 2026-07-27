import React from 'react';
import { Button } from '@openfactu/ui';
import { MessageSquarePlus } from 'lucide-react';

/**
 * Botón flotante que aparece junto a una selección de texto activa dentro de
 * una respuesta de Keiro — clic para citar ese fragmento en el compositor y
 * preguntar específicamente sobre él. Posicionado con coordenadas de
 * viewport (de `range.getBoundingClientRect()`), por eso usa `fixed` y no
 * `absolute`.
 */
export const SelectionToolbar: React.FC<{
  x: number;
  y: number;
  onClick: () => void;
}> = ({ x, y, onClick }) => (
  <div className="fixed z-50 -translate-x-1/2 -translate-y-full" style={{ left: x, top: y - 8 }}>
    <Button
      variant="accent"
      size="sm"
      className="shadow-lg flex items-center gap-1.5 whitespace-nowrap"
      // Evita que el mousedown del click colapse la selección antes de que
      // el contenedor la haya leído para construir esta tarjeta.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <MessageSquarePlus size={14} />
      Preguntar sobre esto
    </Button>
  </div>
);
