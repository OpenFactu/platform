import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Input } from '@openfactu/ui';

interface PluginFieldDef {
  id: string;
  pluginId: string;
  tableName: string;
  fieldName: string;
  fieldType: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'JSONB';
  label: string;
}

interface PluginFieldsProps {
  tableName: string;
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  disabled?: boolean;
}

export const PluginFields: React.FC<PluginFieldsProps> = ({
  tableName,
  values,
  onChange,
  disabled,
}) => {
  const [fields, setFields] = useState<PluginFieldDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFields = async () => {
      try {
        const data = await coreApi.get(`/api/plugins/fields/${tableName}`);
        setFields(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Error loading plugin fields:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFields();
  }, [tableName]);

  if (loading || fields.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border-t border-border-subtle bg-bg-muted">
      <div className="col-span-full">
        <h4 className="text-[10px] font-black uppercase text-fg-subtle tracking-widest mb-2">
          Campos Adicionales (Plugins)
        </h4>
      </div>
      {fields.map((f) => (
        <div key={f.id} className="space-y-1">
          <label className="text-[10px] font-bold text-fg-muted uppercase tracking-tight">
            {f.label}
          </label>
          {f.fieldType === 'BOOLEAN' ? (
            <div className="flex items-center h-10 gap-2">
              <input
                type="checkbox"
                checked={!!values[f.fieldName]}
                onChange={(e) => onChange(f.fieldName, e.target.checked)}
                disabled={disabled}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-xs font-medium text-fg-body">Activar</span>
            </div>
          ) : (
            <Input
              type={f.fieldType === 'INTEGER' || f.fieldType === 'DECIMAL' ? 'number' : 'text'}
              value={values[f.fieldName] || ''}
              onChange={(e) => onChange(f.fieldName, e.target.value)}
              placeholder={f.label}
              disabled={disabled}
              className="h-10 text-sm border-border-default"
            />
          )}
        </div>
      ))}
    </div>
  );
};
