import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  value: string;
  onChange: (v: string | null) => void;
  refTable: string;
  refDisplayField?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Autocomplete contra `/api/custom-fields/ref/:table`. Se usa para el tipo
 * REFERENCE. Es el `SearchableSelect` de @openfactu/ui en modo servidor
 * (`onSearchChange`): antes era un <input> con su lista desplegable a mano.
 */
export const ReferenceSelect: React.FC<Props> = ({
  value,
  onChange,
  refTable,
  refDisplayField = 'name',
  disabled,
  placeholder,
}) => {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [labelByValue, setLabelByValue] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!refTable || !token || !user?.tenantId) return;
    const t = setTimeout(() => {
      setLoading(true);
      coreApi
        .get(
          `/api/custom-fields/ref/${refTable}?display=${encodeURIComponent(refDisplayField)}&q=${encodeURIComponent(q)}`,
        )
        .then((d) => {
          const list = Array.isArray(d) ? d : [];
          setRows(list);
          setLabelByValue((prev) => {
            const next = { ...prev };
            for (const r of list) next[r.id] = r.label;
            return next;
          });
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(t);
  }, [q, refTable, refDisplayField, token, user?.tenantId]);

  // El valor elegido tiene que estar entre las opciones aunque la búsqueda
  // actual no lo traiga; si no, el campo se vería vacío.
  const options = useMemo(() => {
    const list = rows.map((r) => ({ value: r.id, label: r.label }));
    if (value && !rows.some((r) => r.id === value)) {
      list.unshift({ value, label: labelByValue[value] || value });
    }
    return list;
  }, [rows, value, labelByValue]);

  return (
    <SearchableSelect
      options={options}
      value={value || ''}
      onChange={(v) => onChange(v || null)}
      onSearchChange={setQ}
      loading={loading}
      disabled={disabled}
      placeholder={placeholder || t('app.pluginFields.searchRef', { table: refTable })}
      clearable
    />
  );
};
