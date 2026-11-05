import React, { useEffect, useMemo, useState } from 'react';
import { SearchableSelect } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { LinkedObjectArrow } from './LinkedObjectLink';
import { linkedObjectsApi, useLinkedValue } from './linkedObjects';

interface Props {
  value: string;
  onChange: (v: string | null) => void;
  /** El objeto del sistema al que apunta el campo. */
  refObject: string;
  disabled?: boolean;
  placeholder?: string;
}

/** Buscador de un campo enlazado, en modo servidor, con la flecha para abrir lo elegido. */
export const ReferenceSelect: React.FC<Props> = ({
  value,
  onChange,
  refObject,
  disabled,
  placeholder,
}) => {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const linked = useLinkedValue(refObject, value);

  useEffect(() => {
    if (!refObject) return;
    const timer = setTimeout(() => {
      setLoading(true);
      linkedObjectsApi
        .search(refObject, q)
        .then((list) => {
          setRows(Array.isArray(list) ? list : []);
          setDenied(false);
        })
        .catch(() => {
          setRows([]);
          setDenied(true);
        })
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(timer);
  }, [q, refObject]);

  // Lo elegido tiene que estar entre las opciones aunque la búsqueda no lo traiga;
  // si no, el campo se vería vacío.
  const options = useMemo(() => {
    const list = rows.map((r) => ({ value: r.id, label: r.label }));
    if (value && !rows.some((r) => r.id === value)) {
      list.unshift({
        value,
        label:
          linked?.label ??
          (linked?.hidden
            ? t('app.pluginFields.linkedHidden')
            : linked?.missing
              ? t('app.pluginFields.linkedMissing')
              : '…'),
      });
    }
    return list;
  }, [rows, value, linked, t]);

  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <SearchableSelect
          options={options}
          value={value || ''}
          onChange={(v) => onChange(v || null)}
          onSearchChange={setQ}
          loading={loading}
          disabled={disabled || denied}
          placeholder={
            denied
              ? t('app.pluginFields.linkedHidden')
              : placeholder || t('app.pluginFields.searchLinked')
          }
          clearable
        />
      </div>
      {value && <LinkedObjectArrow route={linked?.route} />}
    </div>
  );
};
