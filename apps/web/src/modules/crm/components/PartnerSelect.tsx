import React, { useMemo, useState } from 'react';
import { SearchableSelect, type SearchableSelectOption } from '@openfactu/ui';
import { usePartnerOptions } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { QuickPartnerModal } from './QuickPartnerModal';

interface Props {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/**
 * Selector de interlocutor de los formularios del CRM. Carga la lista él mismo
 * al montarse (es decir, cada vez que se abre el formulario), así que siempre
 * está al día. Si el cliente aún no existe, se crea desde aquí (con permiso de
 * escritura en Interlocutores) y queda seleccionado.
 */
export const PartnerSelect: React.FC<Props> = ({ value, onChange, disabled }) => {
  const { canWrite } = useCrmPermissions('/partners');
  const { options, loading, refresh } = usePartnerOptions();
  const [newName, setNewName] = useState<string | null>(null);
  // El recién creado se enseña ya, sin esperar a que vuelva la lista.
  const [created, setCreated] = useState<SearchableSelectOption | null>(null);
  const allOptions = useMemo(
    () =>
      created && !options.some((o) => o.value === created.value) ? [created, ...options] : options,
    [created, options],
  );

  // El alta rápida es un modal dentro de otro: su submit sintético subiría por
  // el árbol de React hasta el <form> del formulario que lo contiene.
  return (
    <div className="contents" onSubmit={(e) => e.stopPropagation()}>
      <SearchableSelect
        label="Interlocutor"
        options={allOptions}
        value={value}
        onChange={onChange}
        placeholder="Busca o crea un cliente"
        required
        loading={loading}
        disabled={disabled}
        creatable={canWrite}
        createLabel='Crear cliente "{term}"'
        onCreate={(term) => {
          setNewName(term);
        }}
      />
      <QuickPartnerModal
        initialName={newName}
        onClose={() => setNewName(null)}
        onCreated={(p) => {
          setCreated({ value: p.id, label: p.name, secondaryLabel: p.code ?? undefined });
          onChange(p.id);
          refresh();
        }}
      />
    </div>
  );
};
