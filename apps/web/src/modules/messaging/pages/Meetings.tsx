import React, { useState } from 'react';
import { CalendarDays, CalendarPlus, MessageSquare, Video } from 'lucide-react';
import { Badge, Button, Calendar, Modal, PageHeader } from '@openfactu/ui';
import { useTabs } from '@/context/TabsContext';
import { useI18n } from '@/i18n/I18nContext';
import { callClient } from '../api/callClient';
import { rtClient } from '../api/rtClient';
import { MeetingModal } from '../components/MeetingModal';
import { MessagingGate } from '../components/MessagingGate';
import { useMessaging } from '../context/messagingState';
import {
  PHASE_BADGE,
  downloadIcs,
  formAt,
  meetingWhen,
  phaseOf,
  type MeetingForm,
  type MeetingItem,
} from '../domain/meeting';
import { useMeetingsCalendar } from '../hooks/useMeetingsCalendar';

/** Lo que se ve al pulsar una reunión. Cambiarla se hace desde su tarjeta, en el chat. */
const MeetingDetail: React.FC<{ meeting: MeetingItem; onClose: () => void }> = ({
  meeting,
  onClose,
}) => {
  const { t } = useI18n();
  const { openTab } = useTabs();
  const { setFocusConversation } = useMessaging();
  const phase = phaseOf(meeting);
  const open = phase === 'live' || phase === 'upcoming';

  return (
    <Modal isOpen onClose={onClose} title={meeting.title} size="sm" hideCancel>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-body">{meetingWhen(meeting)}</p>
          <Badge variant={PHASE_BADGE[phase]}>{t(`messaging.meetings.phase.${phase}`)}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && meeting.provider === 'keirost' && rtClient.canCall && (
            <Button
              size="sm"
              onClick={() => {
                void callClient.joinMeeting(meeting.meetingId);
                onClose();
              }}
            >
              <Video size={14} />
              {t('messaging.meetings.join')}
            </Button>
          )}
          {open && meeting.joinUrl && (
            <Button
              size="sm"
              onClick={() => window.open(meeting.joinUrl!, '_blank', 'noopener,noreferrer')}
            >
              <Video size={14} />
              {t('messaging.meetings.join')}
            </Button>
          )}
          {open && (
            <Button size="sm" variant="soft" onClick={() => downloadIcs(meeting)}>
              <CalendarPlus size={14} />
              {t('messaging.meetings.addToCalendar')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFocusConversation(meeting.conversationId);
              openTab('/messaging');
              onClose();
            }}
          >
            <MessageSquare size={14} />
            {t('messaging.meetings.calendar.viewConversation')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const MeetingsCalendar: React.FC = () => {
  const { t } = useI18n();
  const cal = useMeetingsCalendar();
  const [selected, setSelected] = useState<MeetingItem | null>(null);
  const [creating, setCreating] = useState<MeetingForm | null>(null);
  const canWrite = rtClient.canWrite;

  return (
    <div className="flex flex-col gap-4 p-4">
      <PageHeader
        title={t('messaging.meetings.calendar.title')}
        icon={<CalendarDays size={18} />}
        size="sm"
        actions={
          canWrite && (
            <Button size="sm" onClick={() => setCreating(formAt(new Date()))}>
              <CalendarPlus size={14} /> {t('messaging.meetings.schedule')}
            </Button>
          )
        }
      />
      {cal.failed && (
        <p role="alert" className="text-sm text-danger-fg">
          {t('messaging.meetings.calendar.loadError')}
        </p>
      )}
      <Calendar
        events={cal.events}
        view={cal.view}
        onViewChange={cal.setView}
        date={cal.cursor}
        onDateChange={cal.setCursor}
        maxPorDia={4}
        emptyMessage={t('messaging.meetings.calendar.empty')}
        onEventClick={(e) => setSelected(cal.byId(e.id) ?? null)}
        onSlotClick={canWrite ? (start) => setCreating(formAt(start)) : undefined}
        onSlotSelect={canWrite ? ({ start, end }) => setCreating(formAt(start, end)) : undefined}
        aria-label={t('messaging.meetings.calendar.title')}
      />
      {selected && <MeetingDetail meeting={selected} onClose={() => setSelected(null)} />}
      {creating && (
        <MeetingModal initial={creating} onSaved={cal.reload} onClose={() => setCreating(null)} />
      )}
    </div>
  );
};

/** Calendario con las reuniones de todas las conversaciones de quien lo mira. */
export const Meetings: React.FC = () => (
  <MessagingGate>
    <MeetingsCalendar />
  </MessagingGate>
);
