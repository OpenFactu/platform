import { useEffect, useState } from 'react';
import { timeclockTerminalApi, type KioskConfig } from '../api/timeclockTerminalApi';
import { DEFAULT_KIOSK_APPEARANCE } from '../domain/kioskAppearance';

export function useKioskAppearance(config: KioskConfig) {
  const [appearance, setAppearance] = useState(DEFAULT_KIOSK_APPEARANCE);
  useEffect(() => {
    if (!config.token || !config.tenant) return;
    const abort = new AbortController();
    const api = timeclockTerminalApi(config);
    let timer: ReturnType<typeof setTimeout>;
    const update = async () => {
      if (!document.hidden) {
        try {
          const value = await api.appearance(abort.signal);
          if (!abort.signal.aborted) setAppearance(value);
        } catch {
          /* Retain the last presentation; identification reports connection errors. */
        }
      }
      if (!abort.signal.aborted) timer = setTimeout(update, 60000);
    };
    void update();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [config]);
  return appearance;
}
