import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { formsApi } from '../api';
import { newField, type CrmForm, type FieldType, type FormField } from '../domain/forms';

/** Operaciones puras sobre la lista de campos. */
export const fieldOps = {
  add: (fields: FormField[], type: FieldType, after?: number) => {
    const f = newField(type);
    const at = after === undefined ? fields.length : after + 1;
    return { fields: [...fields.slice(0, at), f, ...fields.slice(at)], added: f };
  },
  update: (fields: FormField[], id: string, patch: Partial<FormField>) =>
    fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  remove: (fields: FormField[], id: string) => fields.filter((f) => f.id !== id),
  move: (fields: FormField[], id: string, dir: -1 | 1) => {
    const i = fields.findIndex((f) => f.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fields.length) return fields;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  },
};

/**
 * Estado del constructor: el formulario guardado, el borrador en edición, la
 * pregunta seleccionada y el guardado. `dirty` compara con lo último guardado.
 */
export function useFormBuilder(id: string) {
  const { user } = useAuth();
  const [saved, setSaved] = useState<CrmForm | null>(null);
  const [draft, setDraft] = useState<CrmForm | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(
    () =>
      formsApi
        .get(id)
        .then((f) => {
          setSaved(f);
          setDraft(f);
        })
        .catch(() => setNotFound(true)),
    [id],
  );
  useEffect(() => {
    if (user?.tenantId) load();
  }, [user?.tenantId, load]);

  const dirty = useMemo(
    () => !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  );

  const set = (patch: Partial<CrmForm>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setFields = (fields: FormField[]) => set({ fields });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const f = await formsApi.update(draft.id, {
        name: draft.name,
        title: draft.title,
        intro: draft.intro,
        slug: draft.slug,
        isActive: draft.isActive,
        fields: draft.fields,
        settings: draft.settings,
      });
      setSaved(f);
      setDraft(f);
    } finally {
      setSaving(false);
    }
  };

  const fields = draft?.fields ?? [];
  return {
    form: draft,
    notFound,
    dirty,
    saving,
    save,
    set,
    selected: fields.find((f) => f.id === selectedId) ?? null,
    select: setSelectedId,
    addField: (type: FieldType) => {
      const at = selectedId ? fields.findIndex((f) => f.id === selectedId) : -1;
      const { fields: next, added } = fieldOps.add(fields, type, at >= 0 ? at : undefined);
      setFields(next);
      setSelectedId(added.id);
    },
    updateField: (fid: string, patch: Partial<FormField>) =>
      setFields(fieldOps.update(fields, fid, patch)),
    removeField: (fid: string) => {
      setFields(fieldOps.remove(fields, fid));
      if (selectedId === fid) setSelectedId(null);
    },
    moveField: (fid: string, dir: -1 | 1) => setFields(fieldOps.move(fields, fid, dir)),
  };
}

export type FormBuilderState = ReturnType<typeof useFormBuilder>;
