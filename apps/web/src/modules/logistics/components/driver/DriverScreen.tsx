import React from 'react';
import { cn } from '@openfactu/ui';

interface Props {
  header?: React.ReactNode;
  /** Las acciones, abajo: donde llega el pulgar. */
  footer?: React.ReactNode;
  /** `false` para lo que ya ocupa toda la pantalla, como el mapa. */
  scroll?: boolean;
  children: React.ReactNode;
}

/**
 * El armazón de la app del conductor: toda la pantalla, sin el menú del ERP, y con
 * cualquier rol. Va `fixed` y no por portal para que al cambiar de pestaña se oculte
 * con ella.
 */
export const DriverScreen: React.FC<Props> = ({ header, footer, scroll = true, children }) => (
  <div className="fixed inset-0 z-40 flex flex-col bg-bg-app">
    {header && (
      <header className="shrink-0 border-b border-border-subtle bg-bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto w-full max-w-xl">{header}</div>
      </header>
    )}
    <main className={cn('min-h-0 flex-1', scroll ? 'overflow-y-auto' : 'overflow-hidden')}>
      {scroll ? <div className="mx-auto w-full max-w-xl">{children}</div> : children}
    </main>
    {footer && (
      <footer className="shrink-0 border-t border-border-subtle bg-bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-xl space-y-2">{footer}</div>
      </footer>
    )}
  </div>
);
