import { createContext, useContext } from 'react';
import type { MemberDto } from '../domain/messaging';

/** Quién soy y con quién puedo hablar, dentro del host de mensajería. */
export interface MessagingPeople {
  meId: string;
  members: MemberDto[];
  membersById: Map<string, MemberDto>;
  /** El ticket no da escritura: se ve todo, no se escribe nada. */
  readOnly: boolean;
}

export const MessagingPeopleContext = createContext<MessagingPeople | null>(null);

export function useMessagingPeople(): MessagingPeople {
  const ctx = useContext(MessagingPeopleContext);
  if (!ctx) throw new Error('useMessagingPeople debe usarse dentro de MessagingHost');
  return ctx;
}
