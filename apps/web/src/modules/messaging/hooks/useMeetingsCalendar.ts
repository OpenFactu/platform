import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CalendarView } from '@openfactu/ui';
import { messagingApi } from '../api/messagingApi';
import { rtClient } from '../api/rtClient';
import { toCalendarEvent, visibleRange, type MeetingItem } from '../domain/meeting';

/**
 * Datos del calendario de reuniones: qué se pide según lo que se ve, y volver a
 * pedirlo cuando alguien programa, reprograma o cancela una (llega por el socket).
 */
export function useMeetingsCalendar() {
  const [view, setView] = useState<CalendarView>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const { from, to } = visibleRange(view, cursor);
    let cancelled = false;
    messagingApi
      .meetings(from, to)
      .then((found) => {
        if (cancelled) return;
        setItems(found);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [view, cursor, tick]);

  useEffect(
    () =>
      rtClient.subscribe((event) => {
        if (
          (event.type === 'message.created' || event.type === 'message.updated') &&
          event.message.kind === 'meeting'
        ) {
          reload();
        }
      }),
    [reload],
  );

  const events = useMemo(() => items.map(toCalendarEvent), [items]);
  const byId = useCallback((id: string) => items.find((m) => m.meetingId === id), [items]);

  return { view, setView, cursor, setCursor, events, byId, failed, reload };
}
