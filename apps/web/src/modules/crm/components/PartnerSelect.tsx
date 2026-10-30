import { useI18n } from '@/i18n/I18nContext';
import React, { useMemo, useState } from 'react';
import { SearchableSelect, type SearchableSelectOption } from '@openfactu/ui';
import { usePartnerOptions } from '../hooks/useCrmData';
import { useCrmPermissions } from '../hooks/useCrmPermissions';
import { QuickPartnerModal, type QuickPartnerInitial } from './QuickPartnerModal';

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
  const { t } = useI18n();
  const { canWrite } = useCrmPermissions('/partners');
  const { options, loading, refresh } = usePartnerOptions();
  const [newPartner, setNewPartner] = useState<QuickPartnerInitial | null>(null);
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
        label={t('crm.partnerSelect.label')}
        options={allOptions}
        value={value}
        onChange={onChange}
        placeholder={t('crm.partnerSelect.placeholder')}
        required
        loading={loading}
        disabled={disabled}
        creatable={canWrite}
        createLabel={t('crm.partnerSelect.create')}
        onCreate={(term) => {
          setNewPartner({ name: term });
        }}
      />
      <QuickPartnerModal
        initial={newPartner}
        onClose={() => setNewPartner(null)}
        onCreated={(p) => {
          setCreated({ value: p.id, label: p.name, secondaryLabel: p.code ?? undefined });
          onChange(p.id);
          refresh();
        }}
      />
    </div>
  );
};
