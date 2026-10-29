import React from 'react';
import { Button, Tooltip } from '@openfactu/ui';
import { Plus, Save } from 'lucide-react';

interface Props {
  /** Alta (icono +) o edición (disquete). */
  isNew?: boolean;
  label: string;
  saving?: boolean;
}

/**
 * Guardar flotante de las fichas largas (interlocutor, oportunidad…): botón
 * redondo con icono, del tamaño del lanzador del asistente; el texto va en el
 * tooltip y en `aria-label`. Es un `type="submit"`: va dentro del <form>.
 *
 * En escritorio deja libre la esquina del lanzador del asistente
 * (ChatLauncherPanel: `bottom-6 right-6`, 56px); en móvil ese lanzador no se
 * pinta y lo que hay que esquivar es la barra de navegación inferior.
 */
export const FloatingSaveButton: React.FC<Props> = ({ isNew, label, saving }) => (
  <div className="fixed z-30 bottom-6 right-[6.5rem] max-md:right-4 max-md:bottom-20">
    <Tooltip content={label} side="left">
      <Button
        type="submit"
        isLoading={saving}
        disabled={saving}
        aria-label={label}
        className="h-14 w-14 rounded-full p-0 shadow-xl"
      >
        {!saving && (isNew ? <Plus size={22} /> : <Save size={22} />)}
      </Button>
    </Tooltip>
  </div>
);
