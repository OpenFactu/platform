import React from 'react';
import { Button, Tooltip, cn } from '@openfactu/ui';
import { iconButtonClass } from './iconButtonStyles';

/**
 * Botón de solo icono del editor (barra lateral, pie de pregunta).
 *
 * El `ghost` de @openfactu/ui lleva fondo y borde, así que cada icono salía
 * metido en una caja, distinta del «⋮» del menú. Este quita ambos y deja solo
 * el resalte al pasar. La clase vive en `iconButtonStyles`, porque también la
 * usa el disparador del DropdownMenu, que no puede ser un botón.
 */
export const IconButton: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, isLoading, children }) => (
  <Tooltip content={label}>
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      isLoading={isLoading}
      className={cn(iconButtonClass)}
    >
      {children}
    </Button>
  </Tooltip>
);
