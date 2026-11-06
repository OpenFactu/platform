import React from 'react';
import { useHasHeaderBack, useRegisterHeaderBack } from '@/context/HeaderBackContext';
import { useIsMobile } from '@/hooks/useMediaQuery';

/**
 * El botón de volver de una pantalla (`children`). En escritorio se pinta tal cual; en
 * móvil no, porque ya está la flecha de la barra superior, y es esa la que hace `onBack`.
 * Sin `onBack`, la flecha cierra la pestaña, que es lo que hace siempre.
 */
export const PageBack: React.FC<{ onBack?: () => void; children: React.ReactNode }> = ({
  onBack,
  children,
}) => {
  const mobile = useIsMobile();
  const hasHeader = useHasHeaderBack();
  useRegisterHeaderBack(onBack, mobile && hasHeader);
  return mobile && hasHeader ? null : <>{children}</>;
};
