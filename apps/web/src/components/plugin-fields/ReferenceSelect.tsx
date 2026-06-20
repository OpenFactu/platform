import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface Props {
  value: string;
  onChange: (v: string | null) => void;
  refTable: string;
  refDisplayField?: string;
  disabled?: boolean;
  placeholder?: string;
}

/** Autocomplete contra `/api/custom-fields/ref/:table`. Se usa para el tipo REFERENCE. */
export const ReferenceSelect: React.FC<Props> = ({
  value,
  onChange,
  refTable,
  refDisplayField = 'name',
  disabled,
  placeholder,
}) => {
  const { token, user } = useAuth();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [labelByValue, setLabelByValue] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!refTable || !token || !user?.tenantId) return;
    const t = setTimeout(() => {
      fetch(
        `/api/custom-fields/ref/${refTable}?display=${encodeURIComponent(refDisplayField)}&q=${encodeURIComponent(q)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-id': user.tenantId || '',
          },
        },
      )
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d) ? d : [];
          setRows(list);
          setLabelByValue((prev) => {
            const next = { ...prev };
            for (const r of list) next[r.id] = r.label;
            return next;
          });
        })
        .catch(() => setRows([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q, refTable, refDisplayField, token, user?.tenantId]);

  return (
    <div className="relative">
      <input
        type="text"
        value={open ? q : labelByValue[value] || value || ''}
        disabled={disabled}
        placeholder={placeholder || `Buscar ${refTable}...`}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm px-3 disabled:opacity-50"
      />
      {open && rows.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg">
          {rows.map((r) => (
            <li
              key={r.id}
              onMouseDown={() => {
                onChange(r.id);
                setQ('');
                setOpen(false);
              }}
              className="px-3 py-1.5 text-sm hover:bg-primary/10 cursor-pointer"
            >
              {r.label}
            </li>
          ))}
        </ul>
      )}
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs"
          title="Limpiar"
        >
          ✕
        </button>
      )}
    </div>
  );
};
