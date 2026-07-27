import React from 'react';
import { Card, Skeleton } from '@openfactu/ui';

/**
 * Vista de tarjetas para listas de documentos en móvil.
 *
 * La Table de @openfactu/ui fuerza min-w-[720px] en pantallas pequeñas
 * (scroll horizontal con 9 columnas apretadas); en móvil la sustituimos por
 * una tarjeta por documento. Cada página de lista pasa una config mínima
 * reutilizando los mismos render helpers que ya usa en sus columnas.
 */

export interface CardField<T> {
  label: string;
  value: (item: T) => React.ReactNode;
  /** Ocultar el campo cuando no aporta (ej. retención a 0). */
  hidden?: (item: T) => boolean;
}

export interface DocumentCardListProps<T> {
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  /** Línea principal (código de documento). */
  title: (item: T) => React.ReactNode;
  /** Segunda línea bajo el título (ej. cliente). */
  subtitle?: (item: T) => React.ReactNode;
  /** Badge de estado ya renderizado (reutilizar el del listado desktop). */
  status?: (item: T) => React.ReactNode;
  /** Pares label/valor mostrados en grid de 2 columnas. */
  fields: CardField<T>[];
  /** Acciones por tarjeta (ej. descargar PDF); se renderizan en el pie. */
  actions?: (item: T) => React.ReactNode;
  onClick?: (item: T) => void;
  rowKey?: (item: T, index: number) => string | number;
}

export function DocumentCardList<T>({
  data,
  isLoading,
  emptyMessage = 'Sin documentos',
  title,
  subtitle,
  status,
  fields,
  actions,
  onClick,
  rowKey,
}: DocumentCardListProps<T>) {
  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data.length) {
    return <p className="p-8 text-center text-sm font-medium text-fg-subtle">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3 p-3">
      {data.map((item, index) => {
        const key = rowKey ? rowKey(item, index) : ((item as { id?: string }).id ?? index);
        return (
          <div
            key={key}
            onClick={onClick ? () => onClick(item) : undefined}
            className={
              onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : undefined
            }
          >
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-fg-default leading-tight truncate">
                    {title(item)}
                  </div>
                  {subtitle && (
                    <div className="text-xs text-fg-muted mt-0.5 truncate">{subtitle(item)}</div>
                  )}
                </div>
                {status && <div className="shrink-0">{status(item)}</div>}
              </div>
              {fields.length > 0 && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
                  {fields
                    .filter((f) => !f.hidden?.(item))
                    .map((f) => (
                      <div key={f.label} className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-fg-subtle leading-none">
                          {f.label}
                        </p>
                        <div className="text-sm text-fg-body mt-1 truncate">{f.value(item)}</div>
                      </div>
                    ))}
                </div>
              )}
              {actions && (
                <div
                  className="flex justify-end gap-2 mt-3 pt-3 border-t border-border-subtle"
                  onClick={(e) => e.stopPropagation()}
                >
                  {actions(item)}
                </div>
              )}
            </Card>
          </div>
        );
      })}
    </div>
  );
}
