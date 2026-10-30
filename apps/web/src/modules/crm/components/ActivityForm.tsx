import { useI18n } from '@/i18n/I18nContext';
import React, { useState } from 'react';
import { DatePicker, Input, Modal, Select, Switch, Textarea, useToast } from '@openfactu/ui';
import { PartnerSelect } from './PartnerSelect';
import { OwnerSelect } from './OwnerSelect';
import { activitiesApi } from '../api';
import { ACTIVITY_TYPE_OPTIONS, type Activity, type ActivityType } from '../domain/crm';

export type ActivityDraft = Partial<Activity> & { done?: boolean };

interface Props {
  draft: ActivityDraft | null;
  /** Pedir el interlocutor cuando la actividad no nace ligada a nada (pantalla Actividades). */
  askPartner?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ActivityForm: React.FC<Props> = ({ draft, askPartner, onClose, onSaved }) => {
  const toast = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState<ActivityDraft>({});
  const [saving, setSaving] = useState(false);

  // Al abrir con otro borrador se reinicia el formulario (ajuste en render, sin efecto).
  const [seen, setSeen] = useState<ActivityDraft | null>(null);
  if (draft !== seen) {
    setSeen(draft);
    if (draft) setForm({ ...draft, done: !!draft.doneAt });
  }

  const linked = !!(draft?.partnerId || draft?.opportunityId || draft?.contactId);
  const set = (patch: ActivityDraft) => setForm((f) => ({ ...f, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject?.trim()) {
      toast.error(t('crm.activityForm.subjectRequired'));
      return;
    }
    if (!linked && !form.partnerId) {
      toast.error(t('crm.activityForm.partnerRequired'));
      return;
    }
    setSaving(true);
    const payload = {
      type: form.type ?? 'call',
      subject: form.subject,
      body: form.body || null,
      partnerId: form.partnerId || null,
      contactId: form.contactId || null,
      opportunityId: form.opportunityId || null,
      dueAt: form.dueAt ? form.dueAt.slice(0, 10) : null,
      ownerUserId: form.ownerUserId || undefined,
      done: !!form.done,
    };
    try {
      if (form.id) await activitiesApi.update(form.id, payload);
      else await activitiesApi.create(payload);
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
      title={form.id ? t('crm.activityForm.editTitle') : t('crm.activityForm.newTitle')}
      size="lg"
      onSubmit={save}
      primaryAction={{ label: t('crm.common.save'), type: 'submit', isLoading: saving }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-[10rem_1fr] gap-3">
          <Select
            label={t('crm.activityForm.type')}
            options={ACTIVITY_TYPE_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            value={form.type ?? 'call'}
            onChange={(v) => set({ type: v as ActivityType })}
          />
          <Input
            label={t('crm.activityForm.subject')}
            value={form.subject ?? ''}
            onChange={(e) => set({ subject: e.target.value })}
            required
          />
        </div>
        {!linked && askPartner && (
          <PartnerSelect value={form.partnerId ?? ''} onChange={(v) => set({ partnerId: v })} />
        )}
        <Textarea
          label={t('crm.activityForm.detail')}
          rows={3}
          value={form.body ?? ''}
          onChange={(e) => set({ body: e.target.value })}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <DatePicker
            label={t('crm.common.date')}
            value={form.dueAt ? form.dueAt.slice(0, 10) : null}
            onChange={(v) => set({ dueAt: v ?? null })}
          />
          <OwnerSelect value={form.ownerUserId} onChange={(v) => set({ ownerUserId: v })} />
          <Switch
            label={t('crm.activityForm.alreadyDone')}
            checked={!!form.done}
            onChange={(checked) => set({ done: checked })}
          />
        </div>
      </div>
    </Modal>
  );
};
