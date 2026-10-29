/**
 * Operaciones puras del editor sobre la definición: añadir, cambiar, mover,
 * duplicar y quitar preguntas, bloques y secciones. Devuelven una definición
 * nueva (no mutan) para que el guardado automático compare y deshaga fácil.
 */
import {
  CHOICE_TYPES,
  GRID_TYPES,
  newId,
  newQuestion,
  type FormDefinition,
  type Item,
  type Question,
  type QuestionType,
  type Section,
} from '@forms-engine';

const mapSections = (def: FormDefinition, fn: (s: Section) => Section): FormDefinition => ({
  ...def,
  sections: def.sections.map(fn),
});

/** Sección que contiene el elemento, y su posición dentro. */
export function locate(def: FormDefinition, itemId: string) {
  for (let si = 0; si < def.sections.length; si++) {
    const ii = def.sections[si].items.findIndex((i) => i.id === itemId);
    if (ii >= 0) return { sectionIndex: si, itemIndex: ii };
  }
  return null;
}

/** Inserta tras `afterId` (o al final de la última sección) y devuelve el nuevo id. */
export function insertItem(
  def: FormDefinition,
  item: Item,
  afterId?: string | null,
): FormDefinition {
  const at = afterId ? locate(def, afterId) : null;
  const si = at ? at.sectionIndex : def.sections.length - 1;
  const ii = at ? at.itemIndex + 1 : def.sections[si].items.length;
  return mapSections(def, (s) =>
    s === def.sections[si]
      ? { ...s, items: [...s.items.slice(0, ii), item, ...s.items.slice(ii)] }
      : s,
  );
}

export const addQuestion = (def: FormDefinition, type: QuestionType, afterId?: string | null) => {
  const q = newQuestion(type);
  return { def: insertItem(def, q, afterId), id: q.id };
};

export const addTextBlock = (def: FormDefinition, afterId?: string | null) => {
  const item: Item = { kind: 'text', id: newId('t'), title: '' };
  return { def: insertItem(def, item, afterId), id: item.id };
};

export const addImageBlock = (def: FormDefinition, assetId: string, afterId?: string | null) => {
  const item: Item = { kind: 'image', id: newId('i'), assetId };
  return { def: insertItem(def, item, afterId), id: item.id };
};

export function updateItem(def: FormDefinition, id: string, patch: Partial<Item>): FormDefinition {
  return mapSections(def, (s) => ({
    ...s,
    items: s.items.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)),
  }));
}

/**
 * Cambio de tipo de una pregunta: conserva lo que siga teniendo sentido
 * (título, obligatoriedad, opciones entre tipos de opción) y crea lo que el
 * tipo nuevo necesita.
 */
export function changeType(def: FormDefinition, id: string, type: QuestionType): FormDefinition {
  const at = locate(def, id);
  if (!at) return def;
  const old = def.sections[at.sectionIndex].items[at.itemIndex] as Question;
  const fresh = newQuestion(type);
  const next: Question = {
    ...fresh,
    id: old.id,
    title: old.title,
    description: old.description,
    required: old.required,
    showIf: old.showIf,
    mapTo: old.mapTo,
  };
  if (CHOICE_TYPES.includes(type) && old.options?.length) {
    next.options = old.options;
    next.hasOther = type !== 'dropdown' ? old.hasOther : undefined;
  }
  if (GRID_TYPES.includes(type) && GRID_TYPES.includes(old.type)) {
    next.rows = old.rows;
    next.columns = old.columns;
  }
  return updateItem(def, id, next);
}

export function removeItem(def: FormDefinition, id: string): FormDefinition {
  const cleaned = mapSections(def, (s) => ({
    ...s,
    items: s.items
      .filter((i) => i.id !== id)
      // Las condiciones que dependían de esa pregunta dejan de tener sentido.
      .map((i) =>
        i.kind === 'question' && i.showIf?.questionId === id ? { ...i, showIf: undefined } : i,
      ),
  }));
  return cleaned;
}

export function duplicateItem(
  def: FormDefinition,
  id: string,
): { def: FormDefinition; id: string } {
  const at = locate(def, id);
  if (!at) return { def, id };
  const original = def.sections[at.sectionIndex].items[at.itemIndex];
  const copy = JSON.parse(JSON.stringify(original)) as Item;
  copy.id = newId(copy.kind === 'question' ? 'q' : copy.kind === 'text' ? 't' : 'i');
  if (copy.kind === 'question') {
    // Ids de opción nuevos; los saltos se trasladan a los nuevos ids.
    if (copy.options) {
      const map = new Map<string, string>();
      copy.options = copy.options.map((o) => {
        const nid = newId('o');
        map.set(o.id, nid);
        return { ...o, id: nid };
      });
      if (copy.goTo)
        copy.goTo = Object.fromEntries(
          Object.entries(copy.goTo).map(([k, v]) => [map.get(k) ?? k, v]),
        );
      if (copy.quiz?.correct) copy.quiz.correct = copy.quiz.correct.map((c) => map.get(c) ?? c);
    }
  }
  return { def: insertItem(def, copy, id), id: copy.id };
}

/** Reordena los elementos de una sección (desde SortableList). */
export function reorderItems(
  def: FormDefinition,
  sectionId: string,
  items: Item[],
): FormDefinition {
  return mapSections(def, (s) => (s.id === sectionId ? { ...s, items } : s));
}

/** Pasa un elemento a la sección anterior/siguiente (al principio o al final). */
export function moveItemToSection(def: FormDefinition, id: string, dir: -1 | 1): FormDefinition {
  const at = locate(def, id);
  if (!at) return def;
  const target = at.sectionIndex + dir;
  if (target < 0 || target >= def.sections.length) return def;
  const item = def.sections[at.sectionIndex].items[at.itemIndex];
  return {
    ...def,
    sections: def.sections.map((s, i) => {
      if (i === at.sectionIndex) return { ...s, items: s.items.filter((x) => x.id !== id) };
      if (i === target) return { ...s, items: dir === 1 ? [item, ...s.items] : [...s.items, item] };
      return s;
    }),
  };
}

/** Nueva sección tras la que contiene `afterItemId`: se lleva los elementos que venían detrás. */
export function addSection(
  def: FormDefinition,
  afterItemId?: string | null,
): { def: FormDefinition; id: string } {
  const id = newId('s');
  const at = afterItemId ? locate(def, afterItemId) : null;
  if (!at) return { def: { ...def, sections: [...def.sections, { id, items: [] }] }, id };
  const s = def.sections[at.sectionIndex];
  const head = { ...s, items: s.items.slice(0, at.itemIndex + 1) };
  const tail: Section = { id, items: s.items.slice(at.itemIndex + 1), next: s.next };
  delete head.next;
  const sections = [...def.sections];
  sections.splice(at.sectionIndex, 1, head, tail);
  return { def: { ...def, sections }, id };
}

export function updateSection(
  def: FormDefinition,
  id: string,
  patch: Partial<Section>,
): FormDefinition {
  return mapSections(def, (s) => (s.id === id ? { ...s, ...patch } : s));
}

/** Quita la sección: sus elementos pasan a la anterior (o a la siguiente si es la primera). */
export function removeSection(def: FormDefinition, id: string): FormDefinition {
  if (def.sections.length <= 1) return def;
  const idx = def.sections.findIndex((s) => s.id === id);
  if (idx < 0) return def;
  const items = def.sections[idx].items;
  const targetIdx = idx === 0 ? 1 : idx - 1;
  const sections = def.sections
    .map((s, i) =>
      i === targetIdx
        ? { ...s, items: idx === 0 ? [...items, ...s.items] : [...s.items, ...items] }
        : s,
    )
    .filter((s) => s.id !== id)
    // Saltos que iban a la sección borrada vuelven a «la siguiente».
    .map((s) => ({
      ...s,
      next: s.next === id ? undefined : s.next,
      items: s.items.map((i) =>
        i.kind === 'question' && i.goTo
          ? {
              ...i,
              goTo: Object.fromEntries(Object.entries(i.goTo).filter(([, v]) => v !== id)),
            }
          : i,
      ),
    }));
  return { ...def, sections };
}

export function moveSection(def: FormDefinition, id: string, dir: -1 | 1): FormDefinition {
  const i = def.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= def.sections.length) return def;
  const sections = [...def.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...def, sections };
}

/** Preguntas anteriores a `id` (las únicas que pueden usarse en «Mostrar solo si…»). */
export function questionsBefore(def: FormDefinition, id: string): Question[] {
  const out: Question[] = [];
  for (const s of def.sections)
    for (const i of s.items) {
      if (i.id === id) return out;
      if (i.kind === 'question') out.push(i);
    }
  return out;
}
