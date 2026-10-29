import React from 'react';
import { Button } from '@openfactu/ui';
import { Plus, Save } from 'lucide-react';

interface Props {
  /** Alta (icono +) o edición (disquete). */
  isNew?: boolean;
  label: string;
  saving?: boolean;
}

/**
 * Guardar flotante de las fichas largas (interlocutor, oportunidad…). Es un
 * `type="submit"`: va dentro del <form> de la ficha.
 *
 * En escritorio deja libre la esquina del lanzador del asistente
 * (ChatLauncherPanel: `bottom-6 right-6`, 56px); en móvil ese lanzador no se
 * pinta y lo que hay que esquivar es la barra de navegación inferior.
 */
export const FloatingSaveButton: React.FC<Props> = ({ isNew, label, saving }) => (
  <div className="fixed z-30 bottom-6 right-[6.5rem] max-md:right-4 max-md:bottom-20">
    <Button type="submit" size="lg" isLoading={saving} disabled={saving} className="shadow-xl">
      {isNew ? <Plus size={16} /> : <Save size={16} />}
      {label}
    </Button>
  </div>
);
