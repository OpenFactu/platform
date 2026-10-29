import React, { useEffect, useMemo, useState } from 'react';
import {
  CurrencyInput,
  DatePicker,
  Input,
  Modal,
  SearchableSelect,
  Select,
  Textarea,
  useToast,
} from '@openfactu/ui';
import { contactsApi, opportunitiesApi } from '../api';
import { PartnerSelect } from './PartnerSelect';
import type { Contact, Opportunity, OpportunityStage } from '../domain/crm';
import { ActivityList } from './ActivityList';
import { OwnerSelect } from './OwnerSelect';
import { useCrmSettings } from '../hooks/useCrmData';

export type OpportunityDraft = Partial<Opportunity>;

interface Props {
  draft: OpportunityDraft | null;
  stages: OpportunityStage[];
  /** En la ficha del interlocutor el interlocutor ya viene dado. */
  fixedPartnerId?: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const OpportunityForm: React.FC<Props> = ({
  draft,
  stages,
  fixedPartnerId,
  canWrite,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [form, setForm] = useState<OpportunityDraft>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const { settings } = useCrmSettings();

  // Al abrir con otro borrador se reinicia el formulario (ajuste en render, sin efecto).
  const [seen, setSeen] = useState<OpportunityDraft | null>(null);
  if (draft !== seen) {
    setSeen(draft);
    if (draft) setForm({ ...draft, partnerId: draft.partnerId ?? fixedPartnerId });
  }

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

  const set = (patch: OpportunityDraft) => setForm((f) => ({ ...f, ...patch }));

  const stageId = form.stageId ?? stages.find((s) => s.kind === 'open')?.id ?? '';
  const isLost = stages.find((s) => s.id === stageId)?.kind === 'lost';
  // Conserva un motivo u origen que ya no esté en el catálogo de la empresa.
  const withCurrent = (list: string[], current?: string | null) =>
    (current && !list.includes(current) ? [current, ...list] : list).map((v) => ({
      value: v,
      label: v,
    }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title?.trim() || !form.partnerId) {
      toast.error('El título y el interlocutor son obligatorios');
      return;
    }
    if (isLost && !form.lostReason) {
      toast.error('Indica el motivo de pérdida');
      return;
    }
    if (settings.sourceRequired && !form.source) {
      toast.error('Indica el origen de la oportunidad');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      partnerId: form.partnerId,
      contactId: form.contactId || null,
      stageId: form.stageId || undefined,
      amount: form.amount ?? '0',
      expectedCloseDate: form.expectedCloseDate || null,
      notes: form.notes || null,
      ownerUserId: form.ownerUserId || null,
      source: form.source || null,
      lostReason: isLost ? form.lostReason : undefined,
    };
    try {
      if (form.id) await opportunitiesApi.update(form.id, payload);
      else await opportunitiesApi.create(payload);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!draft}
      onClose={onClose}
      title={form.id ? form.title || 'Oportunidad' : 'Nueva oportunidad'}
      size="2xl"
      onSubmit={canWrite ? save : undefined}
      primaryAction={canWrite ? { label: 'Guardar', type: 'submit', isLoading: saving } : undefined}
    >
      <div className="space-y-4">
        <Input
          label="Título"
          value={form.title ?? ''}
          onChange={(e) => set({ title: e.target.value })}
          required
          disabled={!canWrite}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {!fixedPartnerId && (
            <PartnerSelect
              value={form.partnerId ?? ''}
              onChange={(v) => set({ partnerId: v, contactId: null })}
              disabled={!canWrite}
            />
          )}
          <SearchableSelect
            label="Contacto"
            options={contactOptions}
            value={form.contactId ?? ''}
            onChange={(v) => set({ contactId: v || null })}
            placeholder={form.partnerId ? '— ninguno —' : 'Elige antes el interlocutor'}
            clearable
            disabled={!canWrite || !form.partnerId}
          />
          <Select
            label="Etapa"
            options={stageOptions}
            value={stageId}
            onChange={(v) => set({ stageId: v })}
            disabled={!canWrite}
          />
          <CurrencyInput
            label="Importe estimado"
            value={form.amount != null && form.amount !== '' ? Number(form.amount) : null}
            onChange={(v) => set({ amount: v == null ? '0' : String(v) })}
            disabled={!canWrite}
          />
          <DatePicker
            label="Cierre previsto"
            value={form.expectedCloseDate ? form.expectedCloseDate.slice(0, 10) : null}
            onChange={(v) => set({ expectedCloseDate: v ?? null })}
            disabled={!canWrite}
          />
          <OwnerSelect
            value={form.ownerUserId}
            onChange={(v) => set({ ownerUserId: v })}
            disabled={!canWrite}
          />
          <SearchableSelect
            label="Origen"
            options={withCurrent(settings.sources, form.source)}
            value={form.source ?? ''}
            onChange={(v) => set({ source: v || null })}
            placeholder="¿De dónde viene?"
            clearable={!settings.sourceRequired}
            required={settings.sourceRequired}
            disabled={!canWrite}
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
              disabled={!canWrite}
            />
          )}
        </div>
        <Textarea
          label="Notas"
          rows={3}
          value={form.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value })}
          disabled={!canWrite}
        />
        {form.id && (
          <div className="pt-2 border-t border-border-subtle">
            <ActivityList
              title="Actividad"
              filter={{ opportunityId: form.id }}
              defaults={{ opportunityId: form.id, partnerId: form.partnerId }}
              compact
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
