import React, { useEffect, useMemo, useState } from 'react';
import {
  CurrencyInput,
  DatePicker,
  Input,
  SearchableSelect,
  SegmentedControl,
  Select,
  Textarea,
} from '@openfactu/ui';
import { contactsApi } from '../api';
import type { Contact, CrmSettings, Opportunity, OpportunityStage } from '../domain/crm';
import { PartnerSelect } from './PartnerSelect';
import { OwnerSelect } from './OwnerSelect';
import { TagsInput } from './TagsInput';

export type OpportunityDraft = Partial<Opportunity>;

interface Props {
  form: OpportunityDraft;
  set: (patch: OpportunityDraft) => void;
  stages: OpportunityStage[];
  settings: CrmSettings;
  /** Hay líneas de producto: el importe sale de ellas y no se teclea. */
  amountFromLines: boolean;
  /** Texto bajo el importe cuando no lo dan los productos. */
  amountHint?: string;
  disabled?: boolean;
}

/** Conserva un valor que ya no esté en el catálogo de la empresa. */
const withCurrent = (list: string[], current?: string | null) =>
  (current && !list.includes(current) ? [current, ...list] : list).map((v) => ({
    value: v,
    label: v,
  }));

/** Datos de una oportunidad: cliente, etapa, importe, responsable, origen… */
export const OpportunityFields: React.FC<Props> = ({
  form,
  set,
  stages,
  settings,
  amountFromLines,
  amountHint,
  disabled,
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  // Prospecto: sin cliente aún, con sus datos sueltos. Se deduce de lo guardado
  // y el usuario puede cambiarlo mientras no haya cliente elegido.
  const [prospectChosen, setProspectChosen] = useState(false);
  const isProspect =
    !form.partnerId &&
    (prospectChosen || !!(form.isProspect || form.prospectName || form.prospectCompany));

  // Los contactos dependen del interlocutor elegido.
  useEffect(() => {
    if (!form.partnerId) return;
    contactsApi
      .list({ partnerId: form.partnerId })
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [form.partnerId]);

  const stageOptions = useMemo(
    () => stages.map((s) => ({ value: s.id, label: `${s.name} · ${s.probability}%` })),
    [stages],
  );
  // Filtrar por interlocutor evita enseñar los del anterior mientras llegan los nuevos.
  const contactOptions = useMemo(
    () =>
      contacts
        .filter((c) => c.partnerId === form.partnerId)
        .map((c) => ({ value: c.id, label: c.name, secondaryLabel: c.role ?? undefined })),
    [contacts, form.partnerId],
  );
  const stageId = form.stageId ?? stages.find((s) => s.kind === 'open')?.id ?? '';
  const isLost = stages.find((s) => s.id === stageId)?.kind === 'lost';

  return (
    <div className="space-y-4">
      <Input
        label="Título"
        value={form.title ?? ''}
        onChange={(e) => set({ title: e.target.value })}
        required
        disabled={disabled}
      />
      {!form.partnerId && !disabled && (
        <SegmentedControl
          size="sm"
          aria-label="¿Cliente o prospecto?"
          value={isProspect ? 'prospect' : 'client'}
          onChange={(v) => setProspectChosen(v === 'prospect')}
          options={[
            { value: 'client', label: 'Cliente existente' },
            { value: 'prospect', label: 'Prospecto (aún no es cliente)' },
          ]}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {isProspect ? (
          <>
            <Input
              label="Empresa"
              value={form.prospectCompany ?? ''}
              onChange={(e) => set({ prospectCompany: e.target.value })}
              disabled={disabled}
            />
            <Input
              label="Persona de contacto"
              value={form.prospectName ?? ''}
              onChange={(e) => set({ prospectName: e.target.value })}
              disabled={disabled}
            />
            <Input
              label="Correo"
              type="email"
              value={form.prospectEmail ?? ''}
              onChange={(e) => set({ prospectEmail: e.target.value })}
              disabled={disabled}
            />
            <Input
              label="Teléfono"
              type="tel"
              value={form.prospectPhone ?? ''}
              onChange={(e) => set({ prospectPhone: e.target.value })}
              disabled={disabled}
            />
          </>
        ) : (
          <>
            <PartnerSelect
              value={form.partnerId ?? ''}
              onChange={(v) => set({ partnerId: v, contactId: null })}
              disabled={disabled}
            />
            <SearchableSelect
              label="Contacto"
              options={contactOptions}
              value={form.contactId ?? ''}
              onChange={(v) => set({ contactId: v || null })}
              placeholder={form.partnerId ? '— ninguno —' : 'Elige antes el interlocutor'}
              clearable
              disabled={disabled || !form.partnerId}
            />
          </>
        )}
        <Select
          label="Etapa"
          options={stageOptions}
          value={stageId}
          onChange={(v) => set({ stageId: v })}
          disabled={disabled}
        />
        <CurrencyInput
          label="Importe estimado"
          value={form.amount != null && form.amount !== '' ? Number(form.amount) : null}
          onChange={(v) => set({ amount: v == null ? '0' : String(v) })}
          helperText={amountFromLines ? 'Se calcula con los productos.' : amountHint}
          disabled={disabled || amountFromLines}
        />
        <DatePicker
          label="Cierre previsto"
          value={form.expectedCloseDate ? form.expectedCloseDate.slice(0, 10) : null}
          onChange={(v) => set({ expectedCloseDate: v ?? null })}
          disabled={disabled}
        />
        <OwnerSelect
          value={form.ownerUserId}
          onChange={(v) => set({ ownerUserId: v })}
          disabled={disabled}
        />
        <SearchableSelect
          label="Origen"
          options={withCurrent(settings.sources, form.source)}
          value={form.source ?? ''}
          onChange={(v) => set({ source: v || null })}
          placeholder="¿De dónde viene?"
          clearable={!settings.sourceRequired}
          required={settings.sourceRequired}
          disabled={disabled}
        />
        {isLost && (
          <SearchableSelect
            label="Motivo de pérdida"
            options={withCurrent(settings.lostReasons, form.lostReason)}
            value={form.lostReason ?? ''}
            onChange={(v) => set({ lostReason: v || null })}
            placeholder="Elige el motivo"
            creatable
            onCreate={(term) => {
              set({ lostReason: term });
              return term;
            }}
            createLabel="Usar «{term}»"
            required
            disabled={disabled}
          />
        )}
      </div>
      <TagsInput value={form.tags ?? []} onChange={(tags) => set({ tags })} disabled={disabled} />
      <Textarea
        label="Notas"
        rows={3}
        value={form.notes ?? ''}
        onChange={(e) => set({ notes: e.target.value })}
        disabled={disabled}
      />
    </div>
  );
};
