/**
 * Piezas comunes de las tarjetas de «Seguridad»: cabecera del Card, filas alineadas con ella,
 * vacío en una línea y acciones de fila con icono. Así las cinco tarjetas se ven igual.
 */
import React from 'react';
import { Card, Spinner, Tooltip } from '@openfactu/ui';

export const SecurityCard: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, description, action, children }) => (
  <Card title={title} subtitle={description} headerAction={action} noPadding>
    {children}
  </Card>
);

/** Zona con relleno para avisos, botones o el cargando. */
export const SecurityBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="space-y-3 px-6 py-5">{children}</div>
);

export const SecurityLoading: React.FC = () => (
  <div className="flex justify-center px-6 py-6">
    <Spinner />
  </div>
);

/** Una línea gris: vacío o error. */
export const SecurityNote: React.FC<{ children: React.ReactNode; hint?: React.ReactNode }> = ({
  children,
  hint,
}) => (
  <div className="px-6 py-5">
    <p className="text-sm text-fg-muted">{children}</p>
    {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
  </div>
);

/** `flush`: sin el margen lateral del Card, para listas fuera de una tarjeta (la ficha del usuario). */
export const SecurityRows: React.FC<{
  label: string;
  flush?: boolean;
  children: React.ReactNode;
}> = ({ label, flush, children }) => (
  <ul aria-label={label} className={`divide-y divide-border-subtle ${flush ? '[&>li]:px-0' : ''}`}>
    {children}
  </ul>
);

export const SecurityRow: React.FC<{
  icon?: React.ReactNode;
  title: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  /** A la derecha: acciones con icono o un dato corto (la hora). */
  trailing?: React.ReactNode;
}> = ({ icon, title, badge, meta, trailing }) => (
  <li className="flex items-center gap-3 px-6 py-3.5">
    {icon && (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--k-radius-md)] bg-bg-muted text-fg-muted">
        {icon}
      </span>
    )}
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 truncate text-sm font-medium text-fg-default">{title}</p>
        {badge}
      </div>
      {meta && <p className="mt-0.5 break-words text-xs text-fg-muted">{meta}</p>}
    </div>
    {trailing && <div className="flex shrink-0 items-center gap-0.5">{trailing}</div>}
  </li>
);

/** Acción de fila: solo icono, con su nombre en el tooltip y para lectores de pantalla. */
export const RowAction: React.FC<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}> = ({ label, onClick, disabled, danger, children }) => (
  <Tooltip content={label}>
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-8 items-center justify-center rounded-[var(--k-radius-md)] text-fg-muted transition-colors hover:bg-bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40 ${
        danger ? 'hover:text-danger' : 'hover:text-fg-default'
      }`}
    >
      {children}
    </button>
  </Tooltip>
);
