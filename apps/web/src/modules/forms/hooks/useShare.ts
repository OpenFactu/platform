import { useCallback, useEffect, useState } from 'react';
import { formsApi } from '../api/formsApi';
import type { FormInviteRow } from '../domain/types';

type Contact = { id: string; name: string; email: string | null };

/** Separa direcciones escritas a mano (comas, espacios o saltos de línea). */
export function parseEmails(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
    ),
  );
}

/** Datos del modal de compartir: QR, invitaciones y contactos del CRM. */
export function useShare(formId: string, open: boolean, crm: boolean) {
  const [qr, setQr] = useState<string | null>(null);
  const [invites, setInvites] = useState<FormInviteRow[] | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const reloadInvites = useCallback(
    () =>
      formsApi
        .invites(formId)
        .then(setInvites)
        .catch(() => setInvites([])),
    [formId],
  );

  useEffect(() => {
    if (!open) return;
    formsApi
      .qr(formId)
      .then((r) => setQr(r.dataUrl))
      .catch(() => setQr(null));
    reloadInvites();
    if (crm)
      formsApi
        .crmContacts()
        .then(setContacts)
        .catch(() => setContacts([]));
  }, [open, formId, crm, reloadInvites]);

  return { qr, invites, contacts, reloadInvites };
}
