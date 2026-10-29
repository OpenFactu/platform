import React, { useState } from 'react';
import { Input, Modal, Switch, Textarea, useToast } from '@openfactu/ui';
import { contactsApi } from '../api';
import { PartnerSelect } from './PartnerSelect';
import { TagsInput } from './TagsInput';
import type { Contact } from '../domain/crm';

export type ContactDraft = Partial<Contact>;

interface Props {
  draft: ContactDraft | null;
  fixedPartnerId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export const ContactForm: React.FC<Props> = ({ draft, fixedPartnerId, onClose, onSaved }) => {
  const toast = useToast();
  const [form, setForm] = useState<ContactDraft>({});
  const [saving, setSaving] = useState(false);

  // Al abrir con otro borrador se reinicia el formulario (ajuste en render, sin efecto).
  const [seen, setSeen] = useState<ContactDraft | null>(null);
  if (draft !== seen) {
    setSeen(draft);
    if (draft) setForm({ ...draft, partnerId: draft.partnerId ?? fixedPartnerId });
  }

  const set = (patch: ContactDraft) => setForm((f) => ({ ...f, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim() || !form.partnerId) {
      toast.error('El nombre y el interlocutor son obligatorios');
      return;
    }
    setSaving(true);
    const payload = {
      partnerId: form.partnerId,
      name: form.name,
      role: form.role || null,
      email: form.email || null,
      phone: form.phone || null,
      mobile: form.mobile || null,
      isMain: !!form.isMain,
      notes: form.notes || null,
      tags: form.tags ?? [],
    };
    try {
      if (form.id) await contactsApi.update(form.id, payload);
      else await contactsApi.create(payload);
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
      title={form.id ? form.name || 'Contacto' : 'Nuevo contacto'}
      size="lg"
      onSubmit={save}
      primaryAction={{ label: 'Guardar', type: 'submit', isLoading: saving }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Nombre"
            value={form.name ?? ''}
            onChange={(e) => set({ name: e.target.value })}
            required
          />
          <Input
            label="Cargo"
            value={form.role ?? ''}
            onChange={(e) => set({ role: e.target.value })}
          />
        </div>
        {!fixedPartnerId && (
          <PartnerSelect value={form.partnerId ?? ''} onChange={(v) => set({ partnerId: v })} />
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label="Correo"
            type="email"
            value={form.email ?? ''}
            onChange={(e) => set({ email: e.target.value })}
          />
          <Input
            label="Teléfono"
            type="tel"
            value={form.phone ?? ''}
            onChange={(e) => set({ phone: e.target.value })}
          />
          <Input
            label="Móvil"
            type="tel"
            value={form.mobile ?? ''}
            onChange={(e) => set({ mobile: e.target.value })}
          />
        </div>
        <Textarea
          label="Notas"
          rows={2}
          value={form.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value })}
        />
        <TagsInput value={form.tags ?? []} onChange={(tags) => set({ tags })} />
        <Switch
          label="Contacto principal del interlocutor"
          checked={!!form.isMain}
          onChange={(checked) => set({ isMain: checked })}
        />
      </div>
    </Modal>
  );
};
