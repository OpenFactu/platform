import React, { useMemo, useState } from 'react';
import { Input, useToast, cn } from '@openfactu/ui';
import { FIELD_SCHEMA, HELPERS, type FieldDef, type FieldGroup } from '@openfactu/pdf/browser';
import {
  FileText,
  Users,
  Building2,
  ListOrdered,
  Clock,
  Search,
  Copy,
  Code2,
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  Box,
  List,
} from 'lucide-react';

const GROUP_ICON: Record<FieldGroup['icon'], React.ReactNode> = {
  FileText: <FileText size={14} />,
  Users: <Users size={14} />,
  Building2: <Building2 size={14} />,
  ListOrdered: <ListOrdered size={14} />,
  Clock: <Clock size={14} />,
};

const TYPE_ICON: Record<string, React.ReactNode> = {
  string: <Type size={10} />,
  number: <Hash size={10} />,
  boolean: <ToggleLeft size={10} />,
  date: <Calendar size={10} />,
  object: <Box size={10} />,
  array: <List size={10} />,
};

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 border-blue-100 dark:border-blue-500/20',
  number:
    'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 border-emerald-100 dark:border-emerald-500/20',
  boolean: 'bg-purple-50 text-purple-700 border-purple-100',
  date: 'bg-amber-50 text-amber-700 border-amber-100',
  object: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  array: 'bg-rose-50 text-rose-700 border-rose-100',
};

interface Props {
  onInsert?: (variablePath: string) => void;
  insertMode: 'insert' | 'copy';
}

export const FieldExplorer: React.FC<Props> = ({ onInsert, insertMode }) => {
  const [search, setSearch] = useState('');
  const toast = useToast();

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return FIELD_SCHEMA;
    return FIELD_SCHEMA.map((group) => ({
      ...group,
      fields: group.fields.filter(
        (f) => f.path.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
      ),
    })).filter((group) => group.fields.length > 0);
  }, [search]);

  const handleFieldClick = async (field: FieldDef) => {
    const varText = `{{${field.path}}}`;
    if (insertMode === 'insert' && onInsert) {
      onInsert(varText);
      toast.success(`Insertado: ${field.path}`);
    } else {
      try {
        await navigator.clipboard.writeText(varText);
        toast.success(`Copiado: ${varText}`);
      } catch {
        toast.error('No se pudo copiar');
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-2 text-[10px] font-black text-fg-subtle uppercase tracking-widest mb-2">
          <Code2 size={12} /> Campos disponibles
        </div>
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campo..."
            className="pl-7 h-8 text-xs"
          />
        </div>
        <p className="text-[9px] text-fg-subtle italic mt-2 leading-tight">
          {insertMode === 'insert'
            ? 'Click en un campo para insertarlo en el editor'
            : 'Click en un campo para copiarlo al portapapeles'}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredGroups.map((group) => (
          <div key={group.group} className="border-b border-border-subtle">
            <div className="sticky top-0 px-3 py-2 bg-bg-muted border-b border-border-subtle flex items-center gap-2">
              <span className="text-fg-muted">{GROUP_ICON[group.icon]}</span>
              <span className="text-[10px] font-black text-fg-body uppercase tracking-wider">
                {group.label}
              </span>
            </div>
            {group.note && (
              <div className="px-3 py-2 text-[9px] italic text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/40">
                {group.note}
              </div>
            )}
            <div>
              {group.fields.map((field) => (
                <button
                  key={field.path}
                  type="button"
                  onClick={() => handleFieldClick(field)}
                  className="w-full text-left px-3 py-2 hover:bg-bg-hover border-b border-border-subtle last:border-b-0 group transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] font-mono font-semibold text-fg-default truncate">
                          {field.path}
                        </code>
                        <span
                          className={cn(
                            'text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border inline-flex items-center gap-0.5 flex-shrink-0',
                            TYPE_COLORS[field.type] ||
                              'bg-bg-muted text-fg-body border-border-default',
                          )}
                        >
                          {TYPE_ICON[field.type]} {field.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-fg-muted mt-0.5 leading-tight">
                        {field.description}
                      </div>
                      {field.example && (
                        <div className="text-[9px] text-fg-subtle italic mt-0.5 font-mono">
                          ej: {field.example}
                        </div>
                      )}
                    </div>
                    <Copy
                      size={11}
                      className="text-fg-subtle group-hover:text-indigo-500 flex-shrink-0 mt-0.5"
                    />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Helpers de Handlebars */}
        <div className="border-t-2 border-indigo-100">
          <div className="sticky top-0 px-3 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
            <Code2 size={12} className="text-indigo-600" />
            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">
              Helpers Handlebars
            </span>
          </div>
          {HELPERS.map((helper) => (
            <div
              key={helper.name}
              className="px-3 py-2 border-b border-border-subtle last:border-b-0"
            >
              <code className="text-[11px] font-mono font-semibold text-indigo-700 block break-all">
                {helper.usage}
              </code>
              <div className="text-[10px] text-fg-muted mt-0.5">{helper.description}</div>
            </div>
          ))}
        </div>

        {filteredGroups.length === 0 && (
          <div className="p-6 text-center text-fg-subtle text-xs italic">
            No hay campos que coincidan con"{search}"{' '}
          </div>
        )}
      </div>
    </div>
  );
};
