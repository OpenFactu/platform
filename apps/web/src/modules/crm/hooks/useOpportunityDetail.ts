import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { contactsApi, opportunitiesApi } from '../api';
import {
  lineNet,
  type CrmSettings,
  type Opportunity,
  type OpportunityDocument,
  type OpportunityLine,
  type OpportunityStage,
} from '../domain/crm';
import type { OpportunityDraft } from '../components/OpportunityFields';

/** Errores de validación del formulario, o null si se puede guardar. */
export function validateOpportunity(
  form: OpportunityDraft,
  stages: OpportunityStage[],
  settings: CrmSettings,
): string | null {
  if (!form.title?.trim()) return 'El título es obligatorio';
  if (!form.partnerId && !form.prospectName?.trim() && !form.prospectCompany?.trim())
    return 'Elige el cliente o indica el nombre o la empresa del prospecto';
  const stage = stages.find((s) => s.id === form.stageId);
  if (stage?.kind === 'lost' && !form.lostReason) return 'Indica el motivo de pérdida';
  if (settings.sourceRequired && !form.source) return 'Indica el origen de la oportunidad';
  return null;
}

async function fetchOpportunity(id: string) {
  const [opp, ls, documents] = await Promise.all([
    opportunitiesApi.get(id),
    opportunitiesApi.lines(id),
    opportunitiesApi.documents(id).catch(() => [] as OpportunityDocument[]),
  ]);
  const lines: OpportunityLine[] = ls.map((l) => ({
    ...l,
    _key: l.id,
    quantity: Number(l.quantity),
    price: Number(l.price),
    discount: Number(l.discount),
  }));
  return { opp, lines, documents };
}

const emptyLine = (): OpportunityLine => ({
  _key: crypto.randomUUID(),
  itemId: null,
  description: null,
  quantity: 1,
  price: 0,
  discount: 0,
});

/**
 * Estado de la ficha de una oportunidad (`id === 'new'` para el alta): datos,
 * productos de interés y documentos. Guardar escribe la cabecera y, si han
 * cambiado, las líneas (el servidor recalcula el importe con ellas).
 */
export function useOpportunityDetail(id: string, preset: OpportunityDraft = {}) {
  const { user } = useAuth();
  const isNew = id === 'new';
  const [form, setForm] = useState<OpportunityDraft>(() => ({
    ownerUserId: user?.id,
    ...preset,
  }));
  const [lines, setLines] = useState<OpportunityLine[]>([]);
  const [linesDirty, setLinesDirty] = useState(false);
  const [documents, setDocuments] = useState<OpportunityDocument[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    () =>
      fetchOpportunity(id)
        .then(({ opp, lines: ls, documents: docs }) => {
          setForm(opp);
          setLines(ls);
          setLinesDirty(false);
          setDocuments(docs);
        })
        .catch(() => setNotFound(true))
        .finally(() => setLoading(false)),
    [id],
  );

  useEffect(() => {
    if (user?.tenantId && !isNew) load();
  }, [user?.tenantId, isNew, load]);

  const set = (patch: OpportunityDraft) => setForm((f) => ({ ...f, ...patch }));

  // ── Líneas ────────────────────────────────────────────────────────────
  const fetchPrice = async (itemId: string): Promise<number | null> => {
    try {
      const prices = await opportunitiesApi.prices(form.partnerId ?? null, [itemId]);
      return prices[itemId] ?? null;
    } catch {
      return null;
    }
  };

  const addLine = () => {
    setLines((ls) => [...ls, emptyLine()]);
    setLinesDirty(true);
  };

  const updateLine = async (key: string, patch: Partial<OpportunityLine>) => {
    setLines((ls) => ls.map((l) => (l._key === key ? { ...l, ...patch } : l)));
    setLinesDirty(true);
    // Al elegir artículo, su precio para este cliente (tarifa o precio base).
    if (patch.itemId) {
      const price = await fetchPrice(patch.itemId);
      if (price !== null)
        setLines((ls) =>
          ls.map((l) => (l._key === key && l.itemId === patch.itemId ? { ...l, price } : l)),
        );
    }
  };

  const removeLine = (key: string) => {
    setLines((ls) => ls.filter((l) => l._key !== key));
    setLinesDirty(true);
  };

  const linesTotal = useMemo(() => lines.reduce((s, l) => s + lineNet(l), 0), [lines]);

  // ── Guardar ───────────────────────────────────────────────────────────
  /** Guarda y devuelve el id (nuevo o el mismo). Lanza con el mensaje del error. */
  const save = async (): Promise<string> => {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        partnerId: form.partnerId,
        contactId: form.contactId || null,
        stageId: form.stageId || undefined,
        amount: form.amount ?? '0',
        expectedCloseDate: form.expectedCloseDate || null,
        notes: form.notes || null,
        ownerUserId: form.ownerUserId || null,
        source: form.source || null,
        lostReason: form.lostReason || undefined,
        tags: form.tags ?? [],
        prospectName: form.prospectName || null,
        prospectCompany: form.prospectCompany || null,
        prospectEmail: form.prospectEmail || null,
        prospectPhone: form.prospectPhone || null,
      };
      const cleanLines = lines
        .filter((l) => l.itemId || l.description)
        .map((l) => ({
          itemId: l.itemId,
          description: l.description,
          quantity: l.quantity,
          price: l.price,
          discount: l.discount,
        }));
      // Productos antes que la etapa: si este guardado la cierra (ganada o
      // perdida), el servidor ya no aceptaría cambios en los productos.
      if (!isNew && linesDirty) {
        await opportunitiesApi.saveLines(id, cleanLines);
        setLinesDirty(false);
      }
      const saved: Opportunity = isNew
        ? await opportunitiesApi.create(payload)
        : await opportunitiesApi.update(id, payload);
      if (isNew && cleanLines.length > 0) await opportunitiesApi.saveLines(saved.id, cleanLines);
      if (!isNew) await load();
      return saved.id;
    } finally {
      setSaving(false);
    }
  };

  /**
   * El prospecto pasa a cliente: se enlaza el interlocutor recién creado y, si
   * había persona de contacto distinta de la empresa, se crea como contacto
   * principal. Los datos del prospecto se conservan como histórico.
   */
  const convertToClient = async (partnerId: string) => {
    let contactId: string | null = null;
    const person = form.prospectName?.trim();
    if (person && person !== form.prospectCompany?.trim()) {
      const contact = await contactsApi.create({
        partnerId,
        name: person,
        email: form.prospectEmail || null,
        phone: form.prospectPhone || null,
        isMain: true,
      });
      contactId = contact.id;
    }
    await opportunitiesApi.update(id, { partnerId, contactId });
    await load();
  };

  const createQuote = async (validDays?: number) => {
    const res = await opportunitiesApi.createQuote(id, validDays);
    await load();
    return res;
  };

  return {
    isNew,
    form,
    set,
    lines,
    addLine,
    updateLine,
    removeLine,
    linesTotal,
    linesDirty,
    documents,
    loading,
    notFound,
    saving,
    save,
    createQuote,
    convertToClient,
    reload: load,
  };
}

export type OpportunityDetailState = ReturnType<typeof useOpportunityDetail>;
