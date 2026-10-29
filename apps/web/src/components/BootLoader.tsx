import React from 'react';
import { Progress, ShimmerText, Spinner } from '@openfactu/ui';
import { Boxes } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Pantalla de arranque (comprobar instalación y sesión): logo de la empresa
 * con ondas, su nombre con brillo y una barra de progreso. Sustituye al
 * GlobalLoader, que @openfactu/ui marca como obsoleto.
 */
export const BootLoader: React.FC<{ message?: string }> = ({
  message = 'Preparando tu espacio de trabajo…',
}) => {
  const { branding } = useTheme();
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-bg-app px-6 animate-fade animate-duration-500"
    >
      <div className="relative flex h-28 w-28 items-center justify-center">
        <Spinner
          variant="ripple"
          size="xl"
          className="absolute inset-0 m-auto scale-[2.2] opacity-60"
        />
        {branding.logoUrl ? (
          <img
            src={branding.logoUrl}
            alt=""
            className="relative h-16 w-16 rounded-md object-cover shadow-lg"
          />
        ) : (
          <div className="relative flex h-16 w-16 items-center justify-center rounded-md bg-primary shadow-lg">
            <Boxes className="text-primary-fg" size={30} />
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-3">
        <ShimmerText as="h1" className="text-xl font-bold tracking-tight text-fg-default">
          {branding.appName || 'Keirost'}
        </ShimmerText>
        <div className="w-56 max-w-full">
          <Progress indeterminate glow size="sm" />
        </div>
        <p className="text-xs text-fg-muted">{message}</p>
      </div>
    </div>
  );
};
