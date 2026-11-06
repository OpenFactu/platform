import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CallClient } from '../api/callClient';
import { GuestTransport } from '../api/guestTransport';

export type GuestStep = 'form' | 'waiting' | 'call' | 'rejected' | 'invalid' | 'full' | 'ended';

/** Lo que pasa en la página pública de un invitado, de escribir su nombre a colgar. */
export function useGuestCall(token: string) {
  const { transport, client } = useMemo(() => {
    const transport = new GuestTransport(token);
    return { transport, client: new CallClient(transport) };
  }, [token]);
  const snapshot = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [step, setStep] = useState<GuestStep>('form');
  const [name, setName] = useState('');

  useEffect(() => {
    const detach = client.attach();
    void client.beginGuestPreview();
    const unsubscribe = transport.subscribe((event) => {
      switch (event.type) {
        case 'guest.waiting':
          setStep('waiting');
          break;
        case 'guest.admitted':
          setStep('call');
          void client.admitted(event.call);
          break;
        case 'guest.rejected':
          client.leave();
          setStep('rejected');
          transport.close();
          break;
        case 'call.ended':
          setStep('ended');
          transport.close();
          break;
        case 'error':
          client.leave();
          setStep(event.code === 'lobby_full' ? 'full' : 'invalid');
          transport.close();
          break;
      }
    });
    return () => {
      unsubscribe();
      detach();
      transport.close();
    };
  }, [client, transport]);

  // Ha colgado, o se cayó la conexión estando dentro.
  const hungUp = step === 'call' && snapshot.phase === 'idle';

  return {
    client,
    snapshot,
    step: hungUp ? ('ended' as const) : step,
    name,
    setName,
    ask: () => transport.connect(name.trim()),
  };
}
