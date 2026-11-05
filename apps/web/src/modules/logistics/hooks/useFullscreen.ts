import { useCallback, useEffect, useState } from 'react';

/** Pantalla completa del navegador. No todos la tienen: en iOS solo una app instalada. */
export function useFullscreen() {
  const [active, setActive] = useState(() => !!document.fullscreenElement);

  useEffect(() => {
    const update = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const toggle = useCallback(() => {
    const change = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    change?.catch(() => null);
  }, []);

  return { supported: !!document.fullscreenEnabled, active, toggle };
}
