/**
 * Sigue un trabajo concreto y trae su informe cuando acaba.
 *
 * El aviso de progreso global va por WebSocket (ver `useImportJobToast`); esto
 * es la pantalla del informe, que además tiene que funcionar si alguien abre
 * el enlace de un trabajo viejo. Por eso se apoya en sondeo mientras está en
 * curso en vez de en el evento: es la fuente de verdad y no se pierde nada si
 * el socket se cayó.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { dataImportApi } from '../api/dataImportApi';
import type { ImportJob, ImportJobRow } from '../types';

const POLL_MS = 1000;

/**
 * El id va DENTRO del estado, no se resetea aparte al cambiar de trabajo: así
 * no hace falta un `setState` síncrono dentro del efecto (que provoca un
 * render en cascada) y, sobre todo, no se enseña un instante el informe del
 * trabajo anterior mientras llega el nuevo.
 */
interface JobState {
  jobId: string | null;
  job: ImportJob | null;
  errorRows: ImportJobRow[];
}

const EMPTY: JobState = { jobId: null, job: null, errorRows: [] };

export function useImportJob(jobId: string | null) {
  const [state, setState] = useState<JobState>(EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lo que se devuelve es solo lo que corresponde al id pedido.
  const job = state.jobId === jobId ? state.job : null;
  const errorRows = state.jobId === jobId ? state.errorRows : [];
  const isRunning = job?.status === 'pending' || job?.status === 'running';

  const refresh = useCallback(async () => {
    // Sin trabajo no hay nada que traer, y tampoco que limpiar: lo que se
    // devuelve ya se filtra por id, así que el estado viejo no se ve.
    if (!jobId) return;
    try {
      const fresh = await dataImportApi.job(jobId);
      const finished = fresh.status !== 'pending' && fresh.status !== 'running';
      const rows =
        finished && fresh.errorRows > 0 ? await dataImportApi.jobRows(jobId, 'error') : [];
      setState({ jobId, job: fresh, errorRows: rows });
    } catch {
      /* el trabajo puede haberse borrado; se deja lo último que se supo */
    }
  }, [jobId]);

  useEffect(() => {
    // La regla marca cualquier efecto que acabe llamando a setState. Aquí es
    // justo lo que toca hacer: traer del servidor el trabajo que pide la URL.
    // El setState ocurre después del await, no en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!jobId || !isRunning) return;
    timer.current = setTimeout(refresh, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, isRunning, job?.processedRows, refresh]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    await dataImportApi.cancel(jobId).catch(() => undefined);
    refresh();
  }, [jobId, refresh]);

  const undo = useCallback(async () => {
    if (!jobId) return;
    await dataImportApi.undo(jobId);
    refresh();
  }, [jobId, refresh]);

  return { job, errorRows, isRunning, refresh, cancel, undo };
}
