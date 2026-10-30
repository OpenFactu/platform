import React from 'react';
import type { FloatingAction } from '@openfactu/ui';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useMobilePageActions } from '@/context/MobilePageActionsContext';

/**
 * Acciones que en escritorio son botones (los `children`) y en móvil pasan al
 * botón flotante de la pantalla (`actions`). `source` las ordena dentro del
 * menú: ver `useMobilePageActions`.
 */
export const ResponsiveActions: React.FC<{
  source: string;
  actions: FloatingAction[];
  children: React.ReactNode;
}> = ({ source, actions, children }) => {
  const mobile = useIsMobile();
  useMobilePageActions(source, actions, mobile);
  return mobile ? null : <>{children}</>;
};
