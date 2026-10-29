import React, { useMemo, useState } from 'react';
import { Card, SearchInput, Badge, EmptyState, Skeleton } from '@openfactu/ui';
import { Boxes, ChevronRight, Database } from 'lucide-react';
import type { ImportGroup, ImportObject } from '../types';

const GROUP_LABELS: Record<ImportGroup, string> = {
  maestros: 'Datos maestros',
  stock: 'Stock y precios',
  documentos: 'Documentos',
  contabilidad: 'Contabilidad',
  rrhh: 'Recursos humanos',
  crm: 'CRM',
};

const GROUP_ORDER: ImportGroup[] = [
  'maestros',
  'stock',
  'documentos',
  'contabilidad',
  'rrhh',
  'crm',
];

interface Props {
  objects: ImportObject[];
  loading: boolean;
  selected: ImportObject | null;
  onSelect: (object: ImportObject) => void;
}

export const StepObject: React.FC<Props> = ({ objects, loading, selected, onSelect }) => {
  const [term, setTerm] = useState('');

  const grouped = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const matches = objects.filter(
      (o) =>
        !needle ||
        o.label.toLowerCase().includes(needle) ||
        (o.description || '').toLowerCase().includes(needle),
    );
    return GROUP_ORDER.map((group) => ({
      group,
      items: matches.filter((o) => o.group === group),
    })).filter((g) => g.items.length > 0);
  }, [objects, term]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (objects.length === 0) {
    return (
      <EmptyState
        icon={<Database size={32} />}
        title="No hay nada que puedas importar"
        hint="Depende de los módulos activos en la empresa y de tus permisos de escritura."
      />
    );
  }

  return (
    <div className="space-y-4">
      <SearchInput
        value={term}
        onChange={setTerm}
        placeholder="Buscar qué importar…"
        className="max-w-sm"
      />

      {grouped.length === 0 ? (
        <EmptyState
          icon={<Boxes size={28} />}
          title="Nada coincide con la búsqueda"
          hint="Prueba con otra palabra."
        />
      ) : (
        grouped.map(({ group, items }) => (
          <div key={group} className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-fg-subtle">
              {GROUP_LABELS[group]}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((object) => {
                const active = selected?.id === object.id;
                return (
                  // `Card` no acepta onClick: el botón envolvente es además lo
                  // correcto para que la tarjeta se pueda elegir con teclado.
                  <button
                    key={object.id}
                    type="button"
                    onClick={() => onSelect(object)}
                    className="text-left w-full"
                    aria-pressed={active}
                  >
                    <Card
                      className={`cursor-pointer transition-all hover:border-primary/40 ${
                        active ? 'border-primary ring-1 ring-primary/30' : ''
                      }`}
                    >
                      <div className="p-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-fg-default truncate">
                              {object.label}
                            </span>
                            {!object.supportsUpdate && <Badge variant="neutral">solo alta</Badge>}
                          </div>
                          {object.description && (
                            <p className="text-xs text-fg-muted mt-0.5">{object.description}</p>
                          )}
                          <p className="text-[11px] text-fg-subtle mt-1">
                            {object.fields.length} columnas disponibles
                            {object.lines ? ` · con ${object.lines.label.toLowerCase()}` : ''}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-fg-subtle shrink-0 mt-1" />
                      </div>
                    </Card>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
