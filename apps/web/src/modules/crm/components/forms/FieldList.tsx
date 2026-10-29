import React from 'react';
import { Badge, Button, DropdownMenu, EmptyState, cn } from '@openfactu/ui';
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2 } from 'lucide-react';
import { FIELD_TYPE_LABEL, type FieldType } from '../../domain/forms';
import type { FormBuilderState } from '../../hooks/useFormBuilder';

const ADDABLE = Object.keys(FIELD_TYPE_LABEL) as FieldType[];

/** Lista de preguntas: seleccionar, reordenar, quitar y añadir (tras la seleccionada). */
export const FieldList: React.FC<{ builder: FormBuilderState; disabled?: boolean }> = ({
  builder,
  disabled,
}) => {
  const fields = builder.form?.fields ?? [];
  const addMenu = !disabled && (
    <DropdownMenu
      items={ADDABLE.map((t) => ({
        label: FIELD_TYPE_LABEL[t],
        onClick: () => builder.addField(t),
      }))}
    >
      <Button type="button" variant="secondary" size="sm">
        <Plus size={14} /> Añadir pregunta
      </Button>
    </DropdownMenu>
  );

  if (fields.length === 0)
    return (
      <EmptyState
        icon={<ListPlus size={18} />}
        title="Sin preguntas"
        hint="Añade la primera pregunta del formulario."
        action={addMenu || undefined}
      />
    );

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {fields.map((f, i) => {
          const active = builder.selected?.id === f.id;
          return (
            <li
              key={f.id}
              className={cn(
                'flex items-center gap-2 rounded-xs border px-3 py-2 bg-bg-card',
                active ? 'border-accent' : 'border-border-default',
              )}
            >
              <button
                type="button"
                onClick={() => builder.select(f.id)}
                className="flex-1 min-w-0 text-left py-1"
              >
                <span className="block text-sm font-medium text-fg-default truncate">
                  {f.label}
                  {f.required && <span className="text-danger-fg"> *</span>}
                </span>
                <span className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-fg-muted">{FIELD_TYPE_LABEL[f.type]}</span>
                  {f.mapTo && <Badge variant="accent">→ CRM</Badge>}
                </span>
              </button>
              {!disabled && (
                <span className="flex items-center shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => builder.moveField(f.id, -1)}
                  >
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Bajar"
                    disabled={i === fields.length - 1}
                    onClick={() => builder.moveField(f.id, 1)}
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Quitar pregunta"
                    onClick={() => builder.removeField(f.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {addMenu}
    </div>
  );
};
