import React, { useState } from 'react';
import { CalendarClock, CalendarPlus, UserPlus, Video } from 'lucide-react';
import { Badge, Button, ConfirmDialog, useChatActions } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { callClient } from '../api/callClient';
import { messagingApi } from '../api/messagingApi';
import { rtClient } from '../api/rtClient';
import { mapMessage } from '../api/messageCache';
import { useMessagingPeople } from '../context/MessagingPeople';
import { messagingErrorText } from '../domain/errors';
import {
  PHASE_BADGE,
  downloadIcs,
  meetingText,
  meetingWhen,
  phaseOf,
  type MeetingSnapshot,
} from '../domain/meeting';
import { InviteGuestsModal } from './InviteGuestsModal';
import { MeetingModal } from './MeetingModal';

/**
 * Una reunión dentro de la burbuja: cuándo es, entrar y añadirla al
 * calendario. Quien la organiza puede reprogramarla o cancelarla.
 */
export const MeetingCard: React.FC<{ meeting: MeetingSnapshot; conversationId: string }> = ({
  meeting,
  conversationId,
}) => {
  const { t } = useI18n();
  const { meId, readOnly } = useMessagingPeople();
  const actions = useChatActions();
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phase = phaseOf(meeting);
  const open = phase === 'live' || phase === 'upcoming';
  const mine = meeting.organizerId === meId && !readOnly && open;

  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      const dto = await messagingApi.cancelMeeting(
        meeting.meetingId,
        meetingText(meeting, t, true),
      );
      actions.receiveMessages([mapMessage(dto, t)]);
      setConfirming(false);
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-[220px] max-w-[320px] flex-col gap-2 py-1">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-muted text-fg-muted">
          <CalendarClock size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-semibold text-fg-default ${phase === 'cancelled' ? 'line-through' : ''}`}
            title={meeting.title}
          >
            {meeting.title}
          </p>
          <p className="text-xs text-fg-muted">{meetingWhen(meeting)}</p>
        </div>
        <Badge variant={PHASE_BADGE[phase]}>{t(`messaging.meetings.phase.${phase}`)}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {open && meeting.provider === 'keirost' && rtClient.canCall && (
          <Button
            size="sm"
            variant={phase === 'live' ? 'primary' : 'soft'}
            onClick={() => void callClient.joinMeeting(meeting.meetingId)}
          >
            <Video size={14} />
            {t('messaging.meetings.join')}
          </Button>
        )}
        {open && meeting.joinUrl && (
          <Button
            size="sm"
            variant={phase === 'live' ? 'primary' : 'soft'}
            onClick={() => window.open(meeting.joinUrl!, '_blank', 'noopener,noreferrer')}
          >
            <Video size={14} />
            {t('messaging.meetings.join')}
          </Button>
        )}
        {open && (
          <Button size="sm" variant="ghost" onClick={() => downloadIcs(meeting)}>
            <CalendarPlus size={14} />
            {t('messaging.meetings.addToCalendar')}
          </Button>
        )}
        {mine && (
          <>
            {meeting.provider === 'keirost' && rtClient.canCall && (
              <Button size="sm" variant="ghost" onClick={() => setInviting(true)}>
                <UserPlus size={14} />
                {t('messaging.guest.invite')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              {t('messaging.meetings.reschedule')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              {t('messaging.meetings.cancel')}
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-danger-fg">{error}</p>}
      {inviting && (
        <InviteGuestsModal
          conversationId={conversationId}
          meetingId={meeting.meetingId}
          onClose={() => setInviting(false)}
        />
      )}
      {editing && (
        <MeetingModal
          conversationId={conversationId}
          meeting={meeting}
          onSaved={(dto) => actions.receiveMessages([mapMessage(dto, t)])}
          onClose={() => setEditing(false)}
        />
      )}
      <ConfirmDialog
        open={confirming}
        tone="danger"
        title={t('messaging.meetings.cancelTitle')}
        message={t('messaging.meetings.cancelMessage', { title: meeting.title })}
        confirmLabel={t('messaging.meetings.cancelConfirm')}
        cancelLabel={t('common.back')}
        loading={busy}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
};
