import React, { useEffect } from 'react';
import { MessagingGate } from '../components/MessagingGate';
import { useMessaging } from '../context/messagingState';

/**
 * Página de Mensajes. El chat no se monta aquí: `MessagingHost` lo pinta en
 * este hueco por portal, con el mismo estado que el panel lateral.
 */
export const Messages: React.FC = () => {
  const { setPageTarget } = useMessaging();

  useEffect(() => () => setPageTarget(null), [setPageTarget]);

  return (
    <MessagingGate>
      <div ref={setPageTarget} className="h-full min-h-0" />
    </MessagingGate>
  );
};
