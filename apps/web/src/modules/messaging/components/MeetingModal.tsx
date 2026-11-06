import React, { useState } from 'react';
import {
  DatePicker,
  Input,
  Modal,
  SearchableSelect,
  SegmentedControl,
  Select,
  TimePicker,
} from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { messagingApi } from '../api/messagingApi';
import { rtClient } from '../api/rtClient';
import { useMeetingInvitees } from '../hooks/useMeetingInvitees';
import { messagingErrorText } from '../domain/errors';
import type { MessageDto } from '../domain/messaging';

/** El límite del servicio para el título de un grupo (el asunto puede ser más largo). */
const GROUP_TITLE_MAX = 120;
import {
  DURATIONS,
  emptyForm,
  formOf,
  formProblem,
  conversationOption,
  resolveTarget,
  toInput,
  type MeetingProvider,
  type MeetingTarget,
  type TargetProblem,
  type MeetingForm,
  type MeetingSnapshot,
} from '../domain/meeting';

/** La conversación donde anunciarla: la que ya hay o la que hay que abrir. */
async function conversationFor(
  given: string | undefined,
  target: MeetingTarget | TargetProblem | null,
  subject: string,
): Promise<string> {
  if (given) return given;
  if (!target || typeof target === 'string') throw new Error('Reunión sin conversación');
  if (target.kind === 'existing') return target.conversationId;
  const created =
    target.kind === 'direct'
      ? await messagingApi.createDirect(target.userId)
      : await messagingApi.createGroup(subject.slice(0, GROUP_TITLE_MAX), target.userIds);
  return created.id;
}

/**
 * Programar una reunión, o reprogramar una (`meeting`). Desde el chat la
 * conversación ya está decidida; desde el calendario se elige a quién invitar.
 * De momento con un enlace pegado a mano (Meet, Teams, Zoom…): el servicio no
 * crea la sala, solo la anuncia.
 */
export const MeetingModal: React.FC<{
  conversationId?: string;
  /** La conversación es con un cliente. */
  customer?: boolean;
  meeting?: MeetingSnapshot;
  /** Día y hora de partida (el hueco pulsado en el calendario). */
  initial?: MeetingForm;
  onSaved?: (message: MessageDto) => void;
  onClose: () => void;
}> = ({ conversationId, customer, meeting, initial, onSaved, onClose }) => {
  const { t } = useI18n();
  const [form, setForm] = useState<MeetingForm>(() => {
    if (meeting) return formOf(meeting);
    const base = initial ?? emptyForm();
    return { ...base, provider: rtClient.canCall && !customer ? 'keirost' : 'link' };
  });
  const [invited, setInvited] = useState<string[]>([]);
  const picking = !conversationId && !meeting;
  const invitees = useMeetingInvitees(picking);
  const target = picking ? resolveTarget(invited, invitees.conversations, invitees.meId) : null;
  const targetProblem = typeof target === 'string' ? target : null;
  // Un cliente no entra en la videollamada del equipo: solo por enlace.
  const isCustomerSelected = invited.some((v) =>
    invitees.conversations.some((c) => c.kind === 'customer' && conversationOption(c.id) === v),
  );
  if (isCustomerSelected && form.provider === 'keirost') {
    setForm((f) => ({ ...f, provider: 'link' }));
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const problem = formProblem(form);
  const set = (patch: Partial<MeetingForm>) => setForm((f) => ({ ...f, ...patch }));
  const show = (p: typeof problem) =>
    touched && problem === p ? t(`messaging.meetings.problems.${p}`) : undefined;

  const allowKeirost = rtClient.canCall && !customer && !isCustomerSelected;
  const willCreateGroup = typeof target === 'object' && target?.kind === 'group';

  const save = async () => {
    setTouched(true);
    const input = toInput(form, t);
    if (!input || targetProblem) return;
    setSaving(true);
    setError(null);
    try {
      const dto = meeting
        ? await messagingApi.rescheduleMeeting(meeting.meetingId, input)
        : await messagingApi.scheduleMeeting(
            await conversationFor(conversationId, target, input.title),
            input,
          );
      onSaved?.(dto);
      onClose();
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        meeting ? t('messaging.meetings.rescheduleTitle') : t('messaging.meetings.scheduleTitle')
      }
      size="md"
      isBusy={saving}
      error={error}
      primaryAction={{
        label: meeting ? t('messaging.meetings.save') : t('messaging.meetings.schedule'),
        onClick: save,
        disabled: saving || (touched && (Boolean(problem) || Boolean(targetProblem))),
      }}
    >
      <div className="flex flex-col gap-4">
        {picking && (
          <SearchableSelect
            multiple
            label={t('messaging.meetings.calendar.conversation')}
            value={invited}
            onChange={setInvited}
            options={invitees.options}
            placeholder={t('messaging.meetings.calendar.conversationPlaceholder')}
            helperText={willCreateGroup ? t('messaging.meetings.calendar.newGroupHint') : undefined}
            error={
              targetProblem && (touched || targetProblem === 'customerAlone')
                ? t(`messaging.meetings.problems.${targetProblem}`)
                : undefined
            }
            required
          />
        )}
        <Input
          label={t('messaging.meetings.titleLabel')}
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={t('messaging.meetings.titlePlaceholder')}
          error={show('title')}
          maxLength={200}
          required
          autoFocus
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DatePicker
            label={t('messaging.meetings.date')}
            value={form.date}
            onChange={(date) => set({ date })}
            error={show('when') ?? show('past')}
            required
          />
          <TimePicker
            label={t('messaging.meetings.time')}
            value={form.time}
            onChange={(time) => set({ time })}
            required
          />
          <Select
            label={t('messaging.meetings.duration')}
            value={String(form.minutes)}
            onChange={(v) => set({ minutes: Number(v) })}
            options={[...new Set([...DURATIONS, form.minutes])]
              .sort((a, b) => a - b)
              .map((m) => ({
                value: String(m),
                label: t('messaging.meetings.minutes', { n: m }),
              }))}
          />
        </div>
        {allowKeirost && (
          <SegmentedControl<MeetingProvider>
            fullWidth
            value={form.provider}
            onChange={(provider) => set({ provider })}
            options={[
              { value: 'keirost', label: t('messaging.meetings.providers.keirost') },
              { value: 'link', label: t('messaging.meetings.providers.link') },
            ]}
          />
        )}
        {form.provider === 'link' && (
          <Input
            type="url"
            label={t('messaging.meetings.link')}
            value={form.joinUrl}
            onChange={(e) => set({ joinUrl: e.target.value })}
            placeholder="https://meet.google.com/…"
            helperText={show('url') ? undefined : t('messaging.meetings.linkHint')}
            error={show('url')}
            required
          />
        )}
      </div>
    </Modal>
  );
};
