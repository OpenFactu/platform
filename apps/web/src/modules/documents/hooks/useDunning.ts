import { useCallback, useEffect, useState } from 'react';
import { dunningApi } from '../api/salesApi';
import type { DunningLetter, LetterPreview, OverdueCustomer } from '../domain/sales';

/** Lo vencido por cliente y lo ya enviado. */
export function useDunning() {
  const [customers, setCustomers] = useState<OverdueCustomer[]>([]);
  const [letters, setLetters] = useState<DunningLetter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [overdue, sent] = await Promise.all([dunningApi.overdue(), dunningApi.letters()]);
      setCustomers(overdue);
      setLetters(sent);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([dunningApi.overdue(), dunningApi.letters()])
      .then(([overdue, sent]) => {
        if (!alive) return;
        setCustomers(overdue);
        setLetters(sent);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { customers, letters, loading, error, reload };
}

/** La carta de un cliente tal como saldría, y enviarla. */
export function useLetterPreview(partnerId: string) {
  const [preview, setPreview] = useState<LetterPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  const apply = (next: LetterPreview) => {
    setPreview(next);
    setTo(next.to ?? '');
    setProblem(null);
  };
  const reload = useCallback(async () => {
    try {
      apply(await dunningApi.preview(partnerId));
    } catch (e) {
      setPreview(null);
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    let alive = true;
    dunningApi
      .preview(partnerId)
      .then((next) => {
        if (alive) apply(next);
      })
      .catch((e) => {
        if (!alive) return;
        setPreview(null);
        setProblem(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [partnerId]);

  const send = useCallback(async () => {
    setSending(true);
    try {
      return await dunningApi.send(partnerId, to.trim() || undefined);
    } finally {
      setSending(false);
    }
  }, [partnerId, to]);

  const setExcluded = useCallback(
    async (excluded: boolean) => {
      await dunningApi.setExcluded(partnerId, excluded);
      await reload();
    },
    [partnerId, reload],
  );

  return { preview, problem, loading, to, setTo, sending, send, setExcluded };
}
