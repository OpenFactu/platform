import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { erpApi, messagingApi } from '../api/messagingApi';
import { conversationOption, personOption } from '../domain/meeting';
import { conversationTitle, type ConversationDto, type MemberDto } from '../domain/messaging';

/** A quién se puede invitar a una reunión: compañeros, grupos y clientes. */
export function useMeetingInvitees(enabled: boolean) {
  const { user } = useAuth();
  const { t } = useI18n();
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [members, setMembers] = useState<MemberDto[]>([]);
  const meId = user?.id ?? '';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([messagingApi.conversations(), erpApi.members()])
      .then(([foundConversations, foundMembers]) => {
        if (cancelled) return;
        setConversations(foundConversations);
        setMembers(foundMembers);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const options = useMemo(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    const people = members
      .filter((m) => m.id !== meId)
      .map((m) => ({ value: personOption(m.id), label: m.name }));
    // Los chats directos no: ya sale la persona.
    const others = conversations
      .filter((c) => c.kind !== 'direct' && !c.archived)
      .map((c) => ({
        value: conversationOption(c.id),
        label: conversationTitle(c, meId, byId, t),
      }));
    return [...people, ...others].sort((a, b) => a.label.localeCompare(b.label));
  }, [conversations, members, meId, t]);

  return { options, conversations, meId };
}
