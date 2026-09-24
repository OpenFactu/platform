/**
 * El aviso de progreso de las importaciones.
 *
 * Se monta UNA vez en el layout, no en la pantalla del asistente: una carga de
 * cinco mil filas tarda, y quien la lanza se va a seguir trabajando a otro
 * sitio. Si el progreso viviera en la página, cambiar de pestaña sería
 * quedarse a ciegas.
 *
 * Usa el aviso actualizable de `@openfactu/ui` 0.4.0: `toast.loading` con un
 * id propio y `duration: 0` deja el aviso fijo, y cada evento que llega por el
 * WebSocket lo reescribe con `toast.update`. Al terminar, el MISMO aviso se
 * convierte en el resumen y ya sí se cierra solo.
 *
 * Al montar se pregunta si había algo en marcha, para que un F5 en mitad de
 * una carga larga no deje al usuario sin saber si sigue viva.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { useToast, type ToastData, type ToastType } from '@openfactu/ui';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';
import { useTabs } from '@/context/TabsContext';
import { dataImportApi } from '../api/dataImportApi';
import { ImportProgressBody } from '../components/ImportProgressBody';
import type { ImportProgressEvent } from '../types';

const toastIdFor = (jobId: string) => `data-import-${jobId}`;

/** Resumen final, en el mismo aviso. */
function finishedMessage(event: ImportProgressEvent): string {
  if (event.status === 'error') {
    return `La importación de ${event.objectLabel} falló: ${event.error || 'error desconocido'}`;
  }
  if (event.status === 'undone') {
    return `Deshecho: ${event.ok.toLocaleString('es-ES')} registros borrados${
      event.errors > 0 ? `, ${event.errors} no se pudieron borrar` : ''
    }`;
  }

  const verbo = event.dryRun ? 'Simulación' : 'Importación';
  const cola = event.status === 'cancelled' ? ' (cancelada)' : '';
  const base = `${verbo} de ${event.objectLabel}${cola}: ${event.ok.toLocaleString('es-ES')} ${
    event.dryRun ? 'filas válidas' : 'registros'
  }`;
  return event.errors > 0
    ? `${base} y ${event.errors.toLocaleString('es-ES')} con error`
    : `${base}, sin errores`;
}

export function useImportJobToast(): void {
  const toast = useToast();
  const { openTab } = useTabs();
  // Ids de los avisos que este hook ha creado, para no tocar otros.
  const shown = useRef(new Set<string>());

  const verInforme = useCallback(
    (jobId: string) => openTab(`/data-import?job=${jobId}`, { title: 'Importación de datos' }),
    [openTab],
  );

  const onProgress = useCallback(
    (event: ImportProgressEvent) => {
      if (!event?.jobId) return;
      const id = toastIdFor(event.jobId);
      const body = <ImportProgressBody event={event} />;

      if (!shown.current.has(id)) {
        shown.current.add(id);
        toast.loading(body, {
          id,
          duration: 0,
          dismissible: false,
          action:
            event.status === 'undoing'
              ? undefined
              : {
                  label: 'Cancelar',
                  onClick: () => {
                    dataImportApi.cancel(event.jobId).catch(() => {
                      /* si ya terminó, el aviso final lo dirá igualmente */
                    });
                  },
                },
        });
        return;
      }

      toast.update(id, { message: body });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onFinished = useCallback(
    (event: ImportProgressEvent) => {
      if (!event?.jobId) return;
      const id = toastIdFor(event.jobId);
      const message = finishedMessage(event);
      const type: ToastType =
        event.status === 'error' ? 'error' : event.errors > 0 ? 'warning' : 'success';

      const patch: Partial<ToastData> = {
        type,
        message,
        duration: 10_000,
        dismissible: true,
        action: { label: 'Ver informe', onClick: () => verInforme(event.jobId) },
      };

      // Si el trabajo fue tan corto que no llegó ningún progreso, no hay
      // aviso que actualizar: se crea directamente el resumen.
      if (!shown.current.has(id)) toast.show(message, { ...patch, id });
      else toast.update(id, patch);

      shown.current.delete(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verInforme],
  );

  useRealtimeEvents({
    'dataImport.progress': onProgress,
    'dataImport.finished': onFinished,
  });

  // Re-engancharse a lo que ya estuviera corriendo (recarga de página).
  useEffect(() => {
    let cancelled = false;
    dataImportApi
      .activeJobs()
      .then((jobs) => {
        if (cancelled) return;
        for (const job of jobs) {
          onProgress({
            jobId: job.id,
            objectId: job.objectId,
            objectLabel: job.objectId,
            mode: job.mode,
            dryRun: job.dryRun,
            status: 'running',
            total: job.totalRows,
            processed: job.processedRows,
            ok: job.okRows,
            errors: job.errorRows,
            skipped: job.skippedRows,
          });
        }
      })
      .catch(() => {
        /* sin permisos o sin empresa activa: no hay nada que reenganchar */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
