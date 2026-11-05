import React from 'react';
import { Modal } from '@openfactu/ui';

type Props = Omit<React.ComponentProps<typeof Modal>, 'mobilePresentation' | 'style' | 'maxWidth'>;

/**
 * Las ventanas de la app del conductor: a toda la pantalla en el móvil. El fondo va
 * sólido porque algunos temas tienen las tarjetas translúcidas, y a pantalla completa
 * se leería la ruta por detrás.
 */
const SOLID: React.CSSProperties = { background: 'var(--bg-app)' };

export const DriverModal: React.FC<Props> = ({ footer, children, ...rest }) => (
  <Modal
    {...rest}
    mobilePresentation="fullscreen"
    maxWidth="md"
    style={SOLID}
    footer={
      footer ? (
        <div className="w-full p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
      ) : undefined
    }
  >
    {children}
  </Modal>
);
