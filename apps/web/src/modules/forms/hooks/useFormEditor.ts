import { t } from '@/i18n/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { formsApi } from '../api/formsApi';
import type { FormDefinition, FormDoc } from '../domain/types';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Editable = Pick<
  FormDoc,
  'name' | 'title' | 'intro' | 'slug' | 'isActive' | 'definition' | 'settings' | 'theme'
>;
const EDITABLE: (keyof Editable)[] = [
  'name',
  'title',
  'intro',
  'slug',
  'isActive',
  'definition',
  'settings',
  'theme',
];

const AUTOSAVE_MS = 900;

/**
 * Estado del editor con guardado automático, como Google Forms: cada cambio
 * se guarda solo al poco de dejar de escribir. Si el guardado falla se
 * reintenta en el siguiente cambio (o con `retry`) y no se pierde nada local.
 */
export function useFormEditor(id: string) {
  const { user } = useAuth();
  const [form, setForm] = useState<FormDoc | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // Lo último que el servidor tiene, para mandar solo lo que ha cambiado.
  const savedRef = useRef<Editable | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef<FormDoc | null>(null);

  // formRef es la fuente de verdad síncrona: dos cambios seguidos en el mismo
  // tick no se pisan, y las operaciones que generan ids se ejecutan una sola vez.
  const commit = useCallback((next: FormDoc) => {
    formRef.current = next;
    setForm(next);
  }, []);

  useEffect(() => {
    if (!user?.tenantId) return;
    formsApi
      .get(id)
      .then((f) => {
        savedRef.current = f;
        commit(f);
      })
      .catch(() => setNotFound(true));
  }, [id, user?.tenantId, commit]);

  const flush = useCallback(async () => {
    const current = formRef.current;
    const saved = savedRef.current;
    if (!current || !saved) return;
    const changed = EDITABLE.filter((k) => JSON.stringify(current[k]) !== JSON.stringify(saved[k]));
    const patch = Object.fromEntries(changed.map((k) => [k, current[k]])) as Partial<Editable>;
    if (Object.keys(patch).length === 0) return;
    setStatus('saving');
    try {
      const fresh = await formsApi.update(id, patch);
      savedRef.current = { ...saved, ...patch, slug: fresh.slug };
      // publicUrl/responses pueden cambiar (enlace); el resto se queda como lo tiene el editor.
      const f = formRef.current;
      if (f) commit({ ...f, publicUrl: fresh.publicUrl, responses: fresh.responses });
      setStatus('saved');
      setError(null);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : t('forms.errors.saveFailed'));
    }
  }, [id, commit]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  }, [flush]);

  // Al salir de la pantalla, lo pendiente se guarda.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flush();
      }
    },
    [flush],
  );

  const change = useCallback(
    (patch: Partial<Editable>) => {
      const f = formRef.current;
      if (!f) return;
      commit({ ...f, ...patch });
      schedule();
    },
    [schedule, commit],
  );

  /** Aplica una operación pura a la definición (ver domain/editorOps). */
  const apply = useCallback(
    (fn: (def: FormDefinition) => FormDefinition) => {
      const f = formRef.current;
      if (!f) return;
      commit({ ...f, definition: fn(f.definition) });
      schedule();
    },
    [schedule, commit],
  );

  /** Como `apply`, para operaciones que crean algo: devuelve su id (y lo activa). */
  const create = useCallback(
    (fn: (def: FormDefinition) => { def: FormDefinition; id: string }) => {
      const f = formRef.current;
      if (!f) return null;
      const r = fn(f.definition);
      commit({ ...f, definition: r.def });
      setActiveId(r.id);
      schedule();
      return r.id;
    },
    [schedule, commit],
  );

  return {
    form,
    notFound,
    status,
    error,
    retry: flush,
    change,
    apply,
    create,
    activeId,
    setActiveId,
  };
}

export type FormEditorState = ReturnType<typeof useFormEditor>;
