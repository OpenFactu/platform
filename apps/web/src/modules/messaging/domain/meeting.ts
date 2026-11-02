import type { CalendarEvent, CalendarView } from '@openfactu/ui';
import { formatDate, formatTime } from '@/i18n/format';
import type { ConversationDto, Translate } from './messaging';

/**
 * Reuniones: lo que la web necesita saber de ellas, sin React. El servicio las
 * anuncia con un mensaje `meeting` cuyo payload es esta foto; al reprogramar o
 * cancelar, el mensaje se reescribe y la tarjeta cambia sola.
 */

export const MEETING_BLOCK = 'keirost.meeting';

export interface MeetingSnapshot {
  meetingId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /** 'link' de momento; luego 'google_meet', 'ms_teams', 'keirost'. */
  provider: string;
  joinUrl: string | null;
  organizerId: string;
  cancelled: boolean;
}

/** Una reunión en la lista del calendario: su foto y dónde se anunció. */
export interface MeetingItem extends MeetingSnapshot {
  conversationId: string;
  messageId: string;
}

export type MeetingPhase = 'cancelled' | 'ended' | 'live' | 'upcoming';

export function phaseOf(m: MeetingSnapshot, now = Date.now()): MeetingPhase {
  if (m.cancelled) return 'cancelled';
  if (Date.parse(m.endsAt) <= now) return 'ended';
  return Date.parse(m.startsAt) <= now ? 'live' : 'upcoming';
}

export const PHASE_BADGE: Record<MeetingPhase, 'neutral' | 'error' | 'success' | 'info'> = {
  cancelled: 'error',
  ended: 'neutral',
  live: 'success',
  upcoming: 'info',
};

/** Reunión → bloque del calendario. Solo se ve: se cambia desde su tarjeta. */
export function toCalendarEvent(m: MeetingItem): CalendarEvent {
  const phase = phaseOf(m);
  const look: Pick<CalendarEvent, 'status' | 'color'> =
    phase === 'cancelled'
      ? { color: 'var(--k-ink-400, #94a3b8)' }
      : { status: phase === 'ended' ? 'hecha' : phase === 'live' ? 'en-curso' : 'pendiente' };
  return {
    id: m.meetingId,
    title: m.title,
    start: m.startsAt,
    end: m.endsAt,
    locked: true,
    ...look,
  };
}

/** Qué tramo hay que pedir para pintar esa vista (el mes enseña días de sus vecinos). */
export function visibleRange(view: CalendarView, date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  if (view === 'day') {
    to.setDate(to.getDate() + 1);
  } else if (view === 'week') {
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    to.setTime(from.getTime());
    to.setDate(to.getDate() + 7);
  } else {
    from.setDate(1 - 7);
    to.setMonth(to.getMonth() + 1, 1 + 7);
  }
  return { from, to };
}

export interface MeetingInput {
  title: string;
  startsAt: string;
  endsAt: string;
  provider: string;
  joinUrl?: string;
  summary?: string;
}

/** Lo que se rellena en el formulario. */
export interface MeetingForm {
  title: string;
  /** 'YYYY-MM-DD' */
  date: string | null;
  /** 'HH:mm' */
  time: string | null;
  minutes: number;
  /** 'keirost' (videollamada propia) o 'link' (un enlace pegado a mano). */
  provider: MeetingProvider;
  joinUrl: string;
}

export type MeetingProvider = 'keirost' | 'link';

export const DURATIONS = [15, 30, 45, 60, 90, 120];

export function isMeeting(value: unknown): value is MeetingSnapshot {
  const v = value as MeetingSnapshot | null;
  return Boolean(v && typeof v.meetingId === 'string' && typeof v.startsAt === 'string');
}

/** El próximo cuarto de hora: una hora razonable para empezar. */
export function emptyForm(now = new Date()): MeetingForm {
  const next = new Date(now);
  next.setMinutes(Math.ceil((now.getMinutes() + 1) / 15) * 15, 0, 0);
  return {
    title: '',
    date: isoDate(next),
    time: `${pad(next.getHours())}:${pad(next.getMinutes())}`,
    minutes: 30,
    provider: 'link',
    joinUrl: '',
  };
}

/** Formulario para el hueco elegido en el calendario. */
export function formAt(start: Date, end?: Date): MeetingForm {
  const minutes = end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0;
  return {
    ...emptyForm(),
    date: isoDate(start),
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    minutes: minutes >= 5 ? minutes : 30,
  };
}

export function formOf(m: MeetingSnapshot): MeetingForm {
  const start = new Date(m.startsAt);
  return {
    title: m.title,
    date: isoDate(start),
    time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    minutes: Math.max(5, Math.round((Date.parse(m.endsAt) - start.getTime()) / 60000)),
    provider: m.provider === 'keirost' ? 'keirost' : 'link',
    joinUrl: m.joinUrl ?? '',
  };
}

export type FormProblem = 'title' | 'when' | 'past' | 'url';

/** Por qué no se puede guardar todavía (o `null` si se puede). */
export function formProblem(form: MeetingForm, now = new Date()): FormProblem | null {
  if (!form.title.trim()) return 'title';
  const start = startOf(form);
  if (!start) return 'when';
  if (start.getTime() + form.minutes * 60000 < now.getTime()) return 'past';
  if (form.provider === 'link' && !/^https?:\/\/\S+$/i.test(form.joinUrl.trim())) return 'url';
  return null;
}

/** El formulario como petición al servicio; `null` si aún no es válido. */
export function toInput(form: MeetingForm, t: Translate): MeetingInput | null {
  const start = startOf(form);
  if (!start || formProblem(form)) return null;
  const end = new Date(start.getTime() + form.minutes * 60000);
  const meeting = {
    title: form.title.trim(),
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    joinUrl: form.provider === 'link' ? form.joinUrl.trim() : undefined,
  };
  return { ...meeting, provider: form.provider, summary: meetingText(meeting, t) };
}

/** Fecha y horas de la reunión, en el idioma de la interfaz: "lun, 3 nov · 10:00–10:30". */
export function meetingWhen(m: Pick<MeetingSnapshot, 'startsAt' | 'endsAt'>): string {
  const day = formatDate(m.startsAt, { weekday: 'short', day: 'numeric', month: 'short' });
  const hours = { hour: '2-digit', minute: '2-digit' } as const;
  return `${day} · ${formatTime(m.startsAt, hours)}–${formatTime(m.endsAt, hours)}`;
}

/**
 * La reunión en texto: lo que ve quien solo recibe texto (un cliente por
 * Telegram) y lo que sale en la lista de conversaciones y en las respuestas.
 */
export function meetingText(
  m: Pick<MeetingSnapshot, 'title' | 'startsAt' | 'endsAt'> & { joinUrl?: string | null },
  t: Translate,
  cancelled = false,
): string {
  const head = cancelled ? t('messaging.meetings.cancelledText') : t('messaging.meetings.text');
  return [`${head}: ${m.title}`, meetingWhen(m), m.joinUrl ?? ''].filter(Boolean).join('\n');
}

/** Un `.ics` para añadirla al calendario de cada uno (Google, Outlook, Apple…). */
export function toIcs(m: MeetingSnapshot, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Keirost//Mensajes//ES',
    'CALSCALE:GREGORIAN',
    `METHOD:${m.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${m.meetingId}@keirost`,
    `DTSTAMP:${icsDate(now.toISOString())}`,
    `DTSTART:${icsDate(m.startsAt)}`,
    `DTEND:${icsDate(m.endsAt)}`,
    `SUMMARY:${icsText(m.title)}`,
    ...(m.joinUrl ? [`URL:${m.joinUrl}`, `LOCATION:${icsText(m.joinUrl)}`] : []),
    `STATUS:${m.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** En el selector de participantes: `user:<id>` o `conv:<id>`. */
export const personOption = (userId: string) => `user:${userId}`;
export const conversationOption = (conversationId: string) => `conv:${conversationId}`;

export type MeetingTarget =
  | { kind: 'existing'; conversationId: string }
  | { kind: 'direct'; userId: string }
  | { kind: 'group'; userIds: string[] };

export type TargetProblem = 'conversation' | 'customerAlone';

/**
 * Dónde se anuncia la reunión según a quién se invita. La reunión vive en una
 * conversación: quien está dentro la ve en su chat y en su calendario.
 *
 * Un grupo o un cliente solos, en su conversación; una persona, en su chat
 * directo; varios, en el grupo que tenga justo a esa gente o en uno nuevo. Un
 * cliente no se mezcla: su conversación es de la bandeja, no entra en un grupo.
 */
export function resolveTarget(
  selection: string[],
  conversations: ConversationDto[],
  meId: string,
): MeetingTarget | TargetProblem {
  if (selection.length === 0) return 'conversation';
  const chosen = selection.flatMap((value) => {
    const id = value.slice(value.indexOf(':') + 1);
    return value.startsWith('conv:') ? (conversations.find((c) => c.id === id) ?? []) : [];
  });
  if (chosen.some((c) => c.kind === 'customer') && selection.length > 1) return 'customerAlone';
  if (selection.length === 1 && chosen.length === 1) {
    return { kind: 'existing', conversationId: chosen[0].id };
  }
  const people = selection.filter((v) => v.startsWith('user:')).map((v) => v.slice(5));
  const userIds = [...new Set([...people, ...chosen.flatMap((c) => c.participantIds)])].filter(
    (id) => id !== meId,
  );
  if (userIds.length === 0) return 'conversation';
  if (userIds.length === 1) return { kind: 'direct', userId: userIds[0] };
  const wanted = new Set([...userIds, meId]);
  const same = conversations.find(
    (c) =>
      c.kind === 'group' &&
      c.participantIds.length === wanted.size &&
      c.participantIds.every((id) => wanted.has(id)),
  );
  return same ? { kind: 'existing', conversationId: same.id } : { kind: 'group', userIds };
}

export function downloadIcs(m: MeetingSnapshot): void {
  const url = URL.createObjectURL(new Blob([toIcs(m)], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${m.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'reunion'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function startOf(form: MeetingForm): Date | null {
  if (!form.date || !form.time) return null;
  // Hora local de quien la programa; al servicio va en UTC.
  const start = new Date(`${form.date}T${form.time}:00`);
  return Number.isNaN(start.getTime()) ? null : start;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 20261103T090000Z */
function icsDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function icsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
