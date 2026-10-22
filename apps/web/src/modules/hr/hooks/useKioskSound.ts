import { useCallback, useEffect, useRef, useState } from 'react';

type Sound = 'recognized' | 'error' | 'confirmed';
export function useKioskSound(
  allowed: boolean,
  identificationId?: string,
  feedback?: { ok: boolean; message: string; eventId?: string } | null,
) {
  const context = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const lastIdentification = useRef('');
  const lastFeedback = useRef('');
  const mounted = useRef(true);
  const play = useCallback((kind: Sound) => {
    const audio = context.current;
    if (!audio || audio.state !== 'running') return;
    const notes = kind === 'error' ? [220, 165] : kind === 'confirmed' ? [660, 880] : [740];
    notes.forEach((frequency, index) => {
      const at = audio.currentTime + index * 0.14;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.1, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(at);
      oscillator.stop(at + 0.13);
    });
  }, []);
  const testSound = async () => {
    if (!allowed) return;
    try {
      if (!context.current || context.current.state === 'closed') {
        context.current = new AudioContext();
        const audio = context.current;
        audio.onstatechange = () => {
          if (mounted.current && context.current === audio) setEnabled(audio.state === 'running');
        };
      }
      const audio = context.current;
      await audio.resume();
      if (!mounted.current || context.current !== audio) return;
      if (audio.state !== 'running') throw new Error('Audio unavailable');
      setEnabled(true);
      setUnavailable(false);
      play('recognized');
    } catch {
      if (mounted.current) {
        setUnavailable(true);
        setEnabled(false);
      }
    }
  };
  const toggle = async () => {
    if (enabled) {
      setEnabled(false);
      const audio = context.current;
      context.current = null;
      if (audio) {
        audio.onstatechange = null;
        await audio.close().catch(() => {});
      }
    } else await testSound();
  };
  useEffect(() => {
    if (!allowed) {
      setEnabled(false);
      void context.current?.suspend().catch(() => {});
    }
  }, [allowed]);
  useEffect(() => {
    if (!identificationId) {
      lastIdentification.current = '';
      return;
    }
    if (lastIdentification.current !== identificationId) {
      lastIdentification.current = identificationId;
      if (allowed && enabled) play('recognized');
    }
  }, [identificationId, allowed, enabled, play]);
  useEffect(() => {
    const key = feedback ? `${feedback.ok}:${feedback.eventId || feedback.message}` : '';
    if (key && key !== lastFeedback.current && allowed && enabled)
      play(feedback!.ok ? 'confirmed' : 'error');
    lastFeedback.current = key;
  }, [feedback, allowed, enabled, play]);
  useEffect(() => {
    mounted.current = true;
    // Fast Refresh preserves React state but reruns cleanup, which closes audio.
    setEnabled(context.current?.state === 'running');
    return () => {
      mounted.current = false;
      if (context.current) {
        context.current.onstatechange = null;
        void context.current.close().catch(() => {});
      }
      context.current = null;
    };
  }, []);
  return { enabled, unavailable, toggle, testSound };
}
