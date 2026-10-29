import { useEffect, useState } from 'react';
import type { Contact } from '../domain/crm';

/**
 * «¿Cómo fue la llamada?»: al pulsar un teléfono se abre el marcador (tel:) y,
 * cuando el usuario vuelve a la app, se le ofrece apuntar la llamada ya hecha.
 * Solo si ha estado fuera unos segundos: un clic sin llamar no molesta.
 */
export function useCallFollowUp(minAwayMs = 4000) {
  const [calling, setCalling] = useState<{ contact: Contact; at: number } | null>(null);
  const [followUp, setFollowUp] = useState<Contact | null>(null);

  useEffect(() => {
    if (!calling) return;
    const onBack = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - calling.at >= minAwayMs) setFollowUp(calling.contact);
      setCalling(null);
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [calling, minAwayMs]);

  return {
    startCall: (contact: Contact) => setCalling({ contact, at: Date.now() }),
    followUp,
    clear: () => setFollowUp(null),
  };
}
