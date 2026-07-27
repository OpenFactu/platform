import React, { useState } from 'react';
import { cn, Accordion, Badge } from '@openfactu/ui';
import { ChevronRight, Puzzle, ChevronDown } from 'lucide-react';
import { usePluginFields, PluginFieldsSection, type FieldSurface } from './plugin-fields';

interface Props {
  tableName: string;
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  disabled?: boolean;
  layout?: 'sidebar' | 'inline';
  title?: string;
  surface?: FieldSurface;
}

/**
 * Panel de campos plugin. Wrapper fino sobre `PluginFieldsSection`.
 * En modo `sidebar` añade un toggle colapsable con contador; en modo
 * `inline` solo delega.
 */
export const PluginFieldsPanel: React.FC<Props> = ({
  tableName,
  values,
  onChange,
  disabled = false,
  layout = 'inline',
  title = 'Campos Personalizados',
  surface = 'form',
}) => {
  const fields = usePluginFields(tableName, { surface });
  const [collapsed, setCollapsed] = useState(false);

  if (fields.length === 0) return null;

  if (layout === 'sidebar') {
    return (
      <div className="rounded-lg border border-border-default bg-bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center justify-between px-4 py-3 bg-bg-muted border-b border-border-subtle hover:bg-bg-hover transition-colors"
        >
          <div className="flex items-center gap-2">
            <Puzzle size={14} className="text-accent" />
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">
              {title}
            </span>
            <span className="text-[9px] font-bold text-fg-subtle bg-bg-muted px-1.5 py-0.5 rounded-full">
              {fields.length}
            </span>
          </div>
          {collapsed ? (
            <ChevronRight size={14} className="text-fg-subtle" />
          ) : (
            <ChevronDown size={14} className="text-fg-subtle" />
          )}
        </button>
        {!collapsed && (
          <div className="p-4">
            <PluginFieldsSection
              tableName={tableName}
              values={values}
              onChange={onChange}
              disabled={disabled}
              surface={surface}
              header={false}
            />
          </div>
        )}
      </div>
    );
  }

  /**
   * En línea el bloque va dentro de un `Accordion`: en fichas largas (un
   * interlocutor, un artículo) los campos personalizados son lo último y
   * estorban al resto del formulario si no se pueden plegar. Arranca abierto
   * para que no pasen desapercibidos, y el contador deja ver cuántos hay sin
   * necesidad de desplegarlo.
   */
  return (
    <div className={cn('pt-4 border-t border-border-subtle')}>
      <Accordion
        type="multiple"
        defaultOpenKeys={['plugin-fields']}
        items={[
          {
            key: 'plugin-fields',
            title: (
              <span className="flex items-center gap-2">
                <Puzzle size={14} className="text-accent" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-fg-muted">
                  {title}
                </span>
                <Badge variant="neutral">{fields.length}</Badge>
              </span>
            ),
            content: (
              <PluginFieldsSection
                tableName={tableName}
                values={values}
                onChange={onChange}
                disabled={disabled}
                surface={surface}
                header={false}
              />
            ),
          },
        ]}
      />
    </div>
  );
};
