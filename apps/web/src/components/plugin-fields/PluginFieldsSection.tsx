import React from 'react';
import { Puzzle } from 'lucide-react';
import { cn } from '@openfactu/ui';
import { usePluginFields } from './usePluginFields';
import { PluginFieldInput } from './PluginFieldInput';
import type { FieldSurface, PluginFieldDef } from './types';

interface Props {
  tableName: string;
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  disabled?: boolean;
  title?: string;
  surface?: FieldSurface;
  /** Si false no pinta el encabezado Puzzle + título. */
  header?: boolean;
}

/** Renderiza los campos de plugin de una tabla agrupados por `section`,
 *  respetando `displayOrder`, `width`, `helpText`, `required` y `readOnly`. */
export const PluginFieldsSection: React.FC<Props> = ({
  tableName,
  values,
  onChange,
  disabled,
  title = 'Campos Personalizados',
  surface = 'form',
  header = true,
}) => {
  const fields = usePluginFields(tableName, { surface });
  if (fields.length === 0) return null;

  const bySection = new Map<string, PluginFieldDef[]>();
  for (const f of fields) {
    const sec = f.section || '';
    if (!bySection.has(sec)) bySection.set(sec, []);
    bySection.get(sec)!.push(f);
  }

  return (
    <div className="space-y-5">
      {header && (
        <div className="flex items-center gap-2">
          <Puzzle size={14} className="text-primary" />
          <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
            {title}
          </h4>
        </div>
      )}
      {Array.from(bySection.entries()).map(([sec, list]) => (
        <div key={sec || '__default__'} className="space-y-3">
          {sec && (
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-1">
              {sec}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            {list.map((f) => (
              <div
                key={f.id}
                className={cn(
                  'space-y-1',
                  f.width === 'full'
                    ? 'md:col-span-6'
                    : f.width === 'third'
                      ? 'md:col-span-2'
                      : 'md:col-span-3',
                )}
              >
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {f.label}
                  {f.required && <span className="text-rose-500 ml-0.5">*</span>}
                </label>
                <PluginFieldInput
                  def={f}
                  value={values[f.fieldName]}
                  onChange={(v) => onChange(f.fieldName, v)}
                  disabled={disabled}
                />
                {f.helpText && (
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">{f.helpText}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
