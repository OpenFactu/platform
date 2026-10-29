import React, { useRef } from 'react';
import { Button, FloatingActionButton, Tooltip, type FloatingAction } from '@openfactu/ui';
import { Plus, Save } from 'lucide-react';

interface Props {
  /** Alta (icono +) o edición (disquete). */
  isNew?: boolean;
  label: string;
  saving?: boolean;
  /**
   * Acciones de la ficha que en móvil van dentro del botón flotante (en
   * escritorio siguen en la cabecera). Con ellas, en móvil el botón abre un
   * menú con «Guardar» y estas acciones.
   */
  actions?: FloatingAction[];
}

/**
 * Guardar flotante de las fichas largas (interlocutor, oportunidad…): botón
 * redondo con icono, del tamaño del lanzador del asistente; el texto va en el
 * tooltip y en `aria-label`. Es un `type="submit"`: va dentro del <form>.
 *
 * En escritorio deja libre la esquina del lanzador del asistente
 * (ChatLauncherPanel: `bottom-6 right-6`, 56px); en móvil ese lanzador no se
 * pinta y lo que hay que esquivar es la barra de navegación inferior (80px,
 * MobileBottomNav) con algo de aire y el margen seguro del dispositivo.
 */
export const FloatingSaveButton: React.FC<Props> = ({ isNew, label, saving, actions }) => {
  // Ancla dentro del <form>: el menú de móvil envía el formulario desde aquí.
  const anchor = useRef<HTMLSpanElement>(null);
  const withMenu = !!actions?.length;
  const SaveIcon = isNew ? Plus : Save;

  return (
    <>
      <div
        className={`fixed z-30 bottom-6 right-[6.5rem] max-md:right-4 max-md:bottom-[calc(80px+1.25rem+env(safe-area-inset-bottom))]${withMenu ? ' max-md:hidden' : ''}`}
      >
        <Tooltip content={label} side="left">
          <Button
            type="submit"
            isLoading={saving}
            disabled={saving}
            aria-label={label}
            className="h-14 w-14 rounded-full p-0 shadow-xl"
          >
            {!saving && <SaveIcon size={22} />}
          </Button>
        </Tooltip>
      </div>
      {withMenu && (
        <>
          <span ref={anchor} hidden />
          <FloatingActionButton
            className="md:hidden"
            style={{ right: '1rem', bottom: 'calc(80px + 1.25rem + env(safe-area-inset-bottom))' }}
            label="Acciones"
            disabled={saving}
            actions={[
              {
                id: 'save',
                label,
                icon: <SaveIcon size={18} />,
                onClick: () => anchor.current?.closest('form')?.requestSubmit(),
              },
              ...actions!,
            ]}
          />
        </>
      )}
    </>
  );
};
