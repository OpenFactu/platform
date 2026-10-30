import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { Input, Modal, Switch, TagInput, Textarea, useToast } from '@openfactu/ui';
import { contactsApi } from '../api';
import { PartnerSelect } from './PartnerSelect';
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
  const { t } = useI18n();
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
      toast.error(t('crm.contactForm.required'));
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
      toast.error(err instanceof Error ? err.message : t('crm.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={!!draft}
      onClose={onClose}
      title={form.id ? form.name || t('crm.contactForm.contact') : t('crm.contactForm.newTitle')}
      size="lg"
      onSubmit={save}
      primaryAction={{ label: t('crm.common.save'), type: 'submit', isLoading: saving }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label={t('crm.common.name')}
            value={form.name ?? ''}
            onChange={(e) => set({ name: e.target.value })}
            required
          />
          <Input
            label={t('crm.contactForm.role')}
            value={form.role ?? ''}
            onChange={(e) => set({ role: e.target.value })}
          />
        </div>
        {!fixedPartnerId && (
          <PartnerSelect value={form.partnerId ?? ''} onChange={(v) => set({ partnerId: v })} />
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input
            label={t('crm.common.email')}
            type="email"
            value={form.email ?? ''}
            onChange={(e) => set({ email: e.target.value })}
          />
          <Input
            label={t('crm.common.phone')}
            type="tel"
            value={form.phone ?? ''}
            onChange={(e) => set({ phone: e.target.value })}
          />
          <Input
            label={t('crm.common.mobile')}
            type="tel"
            value={form.mobile ?? ''}
            onChange={(e) => set({ mobile: e.target.value })}
          />
        </div>
        <Textarea
          label={t('crm.common.notes')}
          rows={2}
          value={form.notes ?? ''}
          onChange={(e) => set({ notes: e.target.value })}
        />
        <TagInput
          label={t('crm.common.tags')}
          value={form.tags ?? []}
          onChange={(tags) => set({ tags })}
        />
        <Switch
          label={t('crm.contactForm.isMain')}
          checked={!!form.isMain}
          onChange={(checked) => set({ isMain: checked })}
        />
      </div>
    </Modal>
  );
};
