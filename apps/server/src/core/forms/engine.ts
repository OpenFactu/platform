/**
 * Motor de formularios: definición, lógica (secciones, saltos, preguntas
 * condicionales), validación, nota de cuestionario y resumen de respuestas.
 *
 * Es PURO y no importa nada: lo usan el servidor y la web (alias
 * `@forms-engine` en apps/web), así la lógica que ve quien responde y la que
 * comprueba el servidor son la misma. No añadir imports aquí.
 */

// ── Tipos ──────────────────────────────────────────────────────────────────

export type QuestionType =
  | 'shortText'
  | 'paragraph'
  | 'email'
  | 'phone'
  | 'number'
  | 'radio'
  | 'checkbox'
  | 'dropdown'
  | 'scale'
  | 'rating'
  | 'date'
  | 'time'
  | 'file'
  | 'gridRadio'
  | 'gridCheckbox';

export const QUESTION_TYPES: QuestionType[] = [
  'shortText',
  'paragraph',
  'email',
  'phone',
  'number',
  'radio',
  'checkbox',
  'dropdown',
  'scale',
  'rating',
  'date',
  'time',
  'file',
  'gridRadio',
  'gridCheckbox',
];

export const CHOICE_TYPES: QuestionType[] = ['radio', 'checkbox', 'dropdown'];
export const GRID_TYPES: QuestionType[] = ['gridRadio', 'gridCheckbox'];
/** Tipos que admiten «ir a sección según la respuesta». */
export const BRANCHING_TYPES: QuestionType[] = ['radio', 'dropdown'];

export type MapTarget =
  | 'prospectName'
  | 'prospectCompany'
  | 'prospectEmail'
  | 'prospectPhone'
  | 'message';

export interface Option {
  id: string;
  label: string;
}

export interface Validation {
  /** text: length | regex | url · number: range · checkbox: count */
  kind: 'length' | 'regex' | 'url' | 'range' | 'count';
  min?: number;
  max?: number;
  pattern?: string;
  message?: string;
}

export interface Condition {
  questionId: string;
  op: 'equals' | 'notEquals' | 'includes' | 'answered' | 'notAnswered';
  value?: string;
}

export interface QuizSpec {
  points: number;
  /** Ids de opción correctas (opción) o textos aceptados (texto, número). */
  correct?: string[];
  feedbackOk?: string;
  feedbackKo?: string;
}

export interface Question {
  kind: 'question';
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required?: boolean;
  options?: Option[];
  hasOther?: boolean;
  shuffle?: boolean;
  rows?: Option[];
  columns?: Option[];
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string };
  /** rating: número de estrellas (3–10). */
  ratingMax?: number;
  validation?: Validation;
  file?: { maxFiles: number; maxSizeMb: number; accept: string[] };
  showIf?: Condition;
  /** optionId → sectionId | 'submit' */
  goTo?: Record<string, string>;
  quiz?: QuizSpec;
  mapTo?: MapTarget;
}

/** Efecto del título (bloques de texto, secciones y cabecera del formulario). */
export type TitleEffect =
  | 'none'
  | 'gradient'
  | 'gradientAnimated'
  | 'typewriter'
  | 'reveal'
  | 'scramble'
  | 'shimmer';
export const TITLE_EFFECTS: TitleEffect[] = [
  'none',
  'gradient',
  'gradientAnimated',
  'typewriter',
  'reveal',
  'scramble',
  'shimmer',
];

/** Cómo se presenta el texto de un bloque. */
export type TextStyle = 'body' | 'lead' | 'small' | 'quote' | 'callout';

export interface TextBlock {
  kind: 'text';
  id: string;
  title: string;
  /** Admite **negrita**, *cursiva* y ==resaltado==. */
  description?: string;
  effect?: TitleEffect;
  textStyle?: TextStyle;
  /** Letra capital (solo texto normal y entradilla). */
  dropCap?: boolean;
  align?: 'left' | 'center';
}

export interface ImageBlock {
  kind: 'image';
  id: string;
  assetId?: string;
  caption?: string;
}

export type Item = Question | TextBlock | ImageBlock;

export interface Section {
  id: string;
  title?: string;
  description?: string;
  items: Item[];
  titleEffect?: TitleEffect;
  /** Qué viene después: la siguiente, enviar, o una sección concreta. */
  next?: string;
}

export interface FormDefinition {
  version: 2;
  sections: Section[];
}

/** Valor de una respuesta según el tipo. «Otro» va aparte en `${id}:other`. */
export type AnswerValue = string | number | string[] | Record<string, string | string[]>;
export type Answers = Record<string, AnswerValue>;

export const OTHER = '__other__';
export const otherKey = (questionId: string) => `${questionId}:other`;

// ── Versión 1 → 2 ─────────────────────────────────────────────────────────

const V1_TYPE: Record<string, QuestionType | 'section'> = {
  text: 'shortText',
  textarea: 'paragraph',
  email: 'email',
  phone: 'phone',
  number: 'number',
  date: 'date',
  select: 'dropdown',
  radio: 'radio',
  checkbox: 'checkbox',
  rating: 'rating',
  nps: 'scale',
  section: 'section',
};

/**
 * Lee cualquier definición: la v2 tal cual (saneando lo mínimo) o la lista
 * plana de la v1 convertida en una sección. En la v1 las opciones se
 * guardaban por su texto, así que el id de opción ES el texto: las respuestas
 * antiguas siguen casando.
 */
export function normalizeDefinition(raw: unknown, legacyFields?: unknown): FormDefinition {
  const r = raw as any;
  if (r && r.version === 2 && Array.isArray(r.sections) && r.sections.length > 0) {
    return { version: 2, sections: r.sections.map((s: any) => ({ ...s, items: s.items ?? [] })) };
  }
  const fields: any[] = Array.isArray(legacyFields) ? legacyFields : [];
  const items: Item[] = fields.map((f) => {
    const t = V1_TYPE[f?.type] ?? 'shortText';
    if (t === 'section')
      return { kind: 'text', id: String(f.id), title: String(f.label ?? ''), description: f.help };
    const q: Question = {
      kind: 'question',
      id: String(f.id),
      type: t,
      title: String(f.label ?? ''),
      description: f.help,
      required: !!f.required,
    };
    if (Array.isArray(f.options))
      q.options = f.options.map((o: any) => ({ id: String(o), label: String(o) }));
    if (f.type === 'nps')
      q.scale = { min: 0, max: 10, minLabel: 'Nada probable', maxLabel: 'Muy probable' };
    if (f.type === 'rating') q.ratingMax = 5;
    if (f.mapTo) q.mapTo = f.mapTo;
    return q;
  });
  return { version: 2, sections: [{ id: 's1', items }] };
}

// ── Recorrido ──────────────────────────────────────────────────────────────

export const isQuestion = (i: Item): i is Question => i.kind === 'question';

export function allQuestions(def: FormDefinition): Question[] {
  return def.sections.flatMap((s) => s.items.filter(isQuestion));
}

export function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/** ¿Se cumple la condición con las respuestas actuales? */
export function evaluateCondition(c: Condition, answers: Answers): boolean {
  const v = answers[c.questionId];
  switch (c.op) {
    case 'answered':
      return !isEmpty(v);
    case 'notAnswered':
      return isEmpty(v);
    case 'includes':
      return Array.isArray(v) ? v.includes(String(c.value)) : String(v ?? '') === String(c.value);
    case 'notEquals':
      return Array.isArray(v) ? !v.includes(String(c.value)) : String(v ?? '') !== String(c.value);
    case 'equals':
    default:
      return Array.isArray(v) ? v.includes(String(c.value)) : String(v ?? '') === String(c.value);
  }
}

/** Elementos de la sección que se muestran (los condicionales, si se cumple su condición). */
export function visibleItems(section: Section, answers: Answers): Item[] {
  return section.items.filter(
    (i) => !isQuestion(i) || !i.showIf || evaluateCondition(i.showIf, answers),
  );
}

/**
 * Sección que sigue a `sectionId` con estas respuestas: manda el salto de la
 * última pregunta con salto respondida; si no, el `next` de la sección; si no,
 * la siguiente en orden. 'submit' = fin.
 */
export function nextSectionId(def: FormDefinition, sectionId: string, answers: Answers): string {
  const idx = def.sections.findIndex((s) => s.id === sectionId);
  if (idx < 0) return 'submit';
  const section = def.sections[idx];
  let target: string | undefined;
  for (const item of visibleItems(section, answers)) {
    if (!isQuestion(item) || !item.goTo || !BRANCHING_TYPES.includes(item.type)) continue;
    const v = answers[item.id];
    if (typeof v === 'string' && item.goTo[v]) target = item.goTo[v];
  }
  target = target ?? section.next ?? 'next';
  if (target === 'next') return def.sections[idx + 1]?.id ?? 'submit';
  if (target === 'submit') return 'submit';
  return def.sections.some((s) => s.id === target)
    ? target
    : (def.sections[idx + 1]?.id ?? 'submit');
}

/** Secciones por las que pasa quien responde, en orden (sin bucles). */
export function visitedPath(def: FormDefinition, answers: Answers): string[] {
  const path: string[] = [];
  let current = def.sections[0]?.id;
  while (current && current !== 'submit' && !path.includes(current)) {
    path.push(current);
    current = nextSectionId(def, current, answers);
  }
  return path;
}

// ── Validación ────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function checkText(q: Question, s: string): string | null {
  const v = q.validation;
  if (!v) return null;
  if (v.kind === 'length') {
    if (v.min != null && s.length < v.min) return v.message || `Al menos ${v.min} caracteres`;
    if (v.max != null && s.length > v.max) return v.message || `Como mucho ${v.max} caracteres`;
  }
  if (v.kind === 'url' && !URL_RE.test(s)) return v.message || 'Escribe una dirección web válida';
  if (v.kind === 'regex' && v.pattern) {
    try {
      if (v.pattern.length <= 200 && !new RegExp(v.pattern).test(s.slice(0, 500)))
        return v.message || 'El formato no es válido';
    } catch {
      /* patrón mal escrito: no se aplica */
    }
  }
  return null;
}

/**
 * Valida y normaliza la respuesta a UNA pregunta. Devuelve el valor limpio
 * (undefined si vacío) o un error. `extra.other` es el texto de «Otro».
 */
export function validateQuestion(
  q: Question,
  raw: unknown,
  other?: unknown,
): { value?: AnswerValue; other?: string; error?: string } {
  const required = (msg = 'Obligatoria') => (q.required ? { error: msg } : {});
  if (isEmpty(raw)) return required();
  switch (q.type) {
    case 'shortText':
    case 'paragraph':
    case 'phone': {
      const s = String(raw)
        .trim()
        .slice(0, q.type === 'paragraph' ? 5000 : 500);
      if (!s) return required();
      const err = checkText(q, s);
      return err ? { error: err } : { value: s };
    }
    case 'email': {
      const s = String(raw).trim().slice(0, 200);
      return EMAIL_RE.test(s) ? { value: s } : { error: 'Correo no válido' };
    }
    case 'number': {
      const n = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(n)) return { error: 'Número no válido' };
      const v = q.validation;
      if (v?.kind === 'range') {
        if (v.min != null && n < v.min) return { error: v.message || `Mínimo ${v.min}` };
        if (v.max != null && n > v.max) return { error: v.message || `Máximo ${v.max}` };
      }
      return { value: n };
    }
    case 'date':
      return DATE_RE.test(String(raw)) ? { value: String(raw) } : { error: 'Fecha no válida' };
    case 'time':
      return TIME_RE.test(String(raw)) ? { value: String(raw) } : { error: 'Hora no válida' };
    case 'scale': {
      const n = Number(raw);
      const min = q.scale?.min ?? 1;
      const max = q.scale?.max ?? 5;
      return Number.isInteger(n) && n >= min && n <= max
        ? { value: n }
        : { error: `Elige un valor entre ${min} y ${max}` };
    }
    case 'rating': {
      const n = Number(raw);
      const max = q.ratingMax ?? 5;
      return Number.isInteger(n) && n >= 1 && n <= max
        ? { value: n }
        : { error: `Elige entre 1 y ${max}` };
    }
    case 'radio':
    case 'dropdown': {
      const s = String(raw);
      if (s === OTHER && q.hasOther) {
        const o = String(other ?? '')
          .trim()
          .slice(0, 500);
        return o ? { value: OTHER, other: o } : { error: 'Escribe tu respuesta en «Otro»' };
      }
      return q.options?.some((o) => o.id === s) ? { value: s } : { error: 'Opción no válida' };
    }
    case 'checkbox': {
      const list = Array.from(new Set((Array.isArray(raw) ? raw : [raw]).map(String)));
      const valid = list.filter(
        (x) => q.options?.some((o) => o.id === x) || (x === OTHER && q.hasOther),
      );
      if (valid.length === 0) return required('Elige al menos una opción');
      let o: string | undefined;
      if (valid.includes(OTHER)) {
        o = String(other ?? '')
          .trim()
          .slice(0, 500);
        if (!o) return { error: 'Escribe tu respuesta en «Otro»' };
      }
      const v = q.validation;
      if (v?.kind === 'count') {
        if (v.min != null && valid.length < v.min)
          return { error: v.message || `Elige al menos ${v.min}` };
        if (v.max != null && valid.length > v.max)
          return { error: v.message || `Elige como mucho ${v.max}` };
      }
      return { value: valid, other: o };
    }
    case 'gridRadio':
    case 'gridCheckbox': {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return { error: 'Respuesta no válida' };
      const rows = q.rows ?? [];
      const cols = new Set((q.columns ?? []).map((c) => c.id));
      const out: Record<string, string | string[]> = {};
      for (const r of rows) {
        const cell = (raw as any)[r.id];
        if (q.type === 'gridRadio') {
          if (typeof cell === 'string' && cols.has(cell)) out[r.id] = cell;
        } else if (Array.isArray(cell)) {
          const list = cell.map(String).filter((c) => cols.has(c));
          if (list.length) out[r.id] = Array.from(new Set(list));
        }
      }
      // Obligatoria en una cuadrícula = una respuesta por fila.
      if (q.required && Object.keys(out).length < rows.length)
        return { error: 'Responde todas las filas' };
      return Object.keys(out).length ? { value: out } : {};
    }
    case 'file': {
      const list = (Array.isArray(raw) ? raw : [raw]).map(String).filter(Boolean);
      const max = q.file?.maxFiles ?? 1;
      if (list.length > max) return { error: `Como mucho ${max} archivo(s)` };
      return list.length ? { value: list } : required('Sube un archivo');
    }
    default:
      return {};
  }
}

/**
 * Valida un envío completo: solo las secciones del camino y las preguntas
 * visibles (lo demás se descarta, aunque venga). Errores por id de pregunta.
 */
export function validateAnswers(
  def: FormDefinition,
  raw: Record<string, unknown>,
): { answers: Answers; errors: Record<string, string>; path: string[] } {
  const input = (raw ?? {}) as Answers;
  const path = visitedPath(def, input);
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  for (const sectionId of path) {
    const section = def.sections.find((s) => s.id === sectionId)!;
    for (const item of visibleItems(section, { ...input, ...answers })) {
      if (!isQuestion(item)) continue;
      const r = validateQuestion(item, input[item.id], input[otherKey(item.id)]);
      if (r.error) errors[item.id] = r.error;
      if (r.value !== undefined) answers[item.id] = r.value;
      if (r.other) answers[otherKey(item.id)] = r.other;
    }
  }
  return { answers, errors, path };
}

/** Errores de una sola sección (para «Siguiente» en la página pública). */
export function validateSection(
  def: FormDefinition,
  sectionId: string,
  raw: Answers,
): Record<string, string> {
  const section = def.sections.find((s) => s.id === sectionId);
  const errors: Record<string, string> = {};
  if (!section) return errors;
  for (const item of visibleItems(section, raw)) {
    if (!isQuestion(item)) continue;
    const r = validateQuestion(item, raw[item.id], raw[otherKey(item.id)]);
    if (r.error) errors[item.id] = r.error;
  }
  return errors;
}

// ── Cuestionario ──────────────────────────────────────────────────────────

const AUTO_GRADED: QuestionType[] = [
  'radio',
  'dropdown',
  'checkbox',
  'shortText',
  'email',
  'number',
  'scale',
];

export interface QuestionGrade {
  points: number;
  max: number;
  /** null = pendiente de corrección manual. */
  correct: boolean | null;
}

/**
 * Nota de un cuestionario. Las preguntas de opción y las de texto corto con
 * respuestas aceptadas se corrigen solas; el resto queda pendiente hasta que
 * alguien las puntúe (`manual`, puntos por pregunta).
 */
export function gradeResponse(
  def: FormDefinition,
  answers: Answers,
  manual: Record<string, number> = {},
): { score: number; maxScore: number; pending: boolean; questions: Record<string, QuestionGrade> } {
  const questions: Record<string, QuestionGrade> = {};
  let score = 0;
  let maxScore = 0;
  let pending = false;
  const path = new Set(visitedPath(def, answers));
  for (const s of def.sections) {
    if (!path.has(s.id)) continue;
    for (const q of visibleItems(s, answers).filter(isQuestion)) {
      const max = q.quiz?.points ?? 0;
      if (max <= 0) continue;
      maxScore += max;
      let g: QuestionGrade;
      if (manual[q.id] != null) {
        const p = Math.max(0, Math.min(max, Number(manual[q.id]) || 0));
        g = { points: p, max, correct: p >= max };
      } else if (AUTO_GRADED.includes(q.type) && q.quiz?.correct?.length) {
        const v = answers[q.id];
        const correct = q.quiz.correct;
        let ok: boolean;
        if (q.type === 'checkbox') {
          const got = new Set(Array.isArray(v) ? v : []);
          ok = got.size === correct.length && correct.every((c) => got.has(c));
        } else if (q.type === 'shortText' || q.type === 'email') {
          const s = String(v ?? '')
            .trim()
            .toLowerCase();
          ok = correct.some((c) => c.trim().toLowerCase() === s);
        } else {
          ok = correct.some((c) => String(c) === String(v ?? ''));
        }
        g = { points: ok ? max : 0, max, correct: ok };
      } else if (isEmpty(answers[q.id])) {
        g = { points: 0, max, correct: false };
      } else {
        g = { points: 0, max, correct: null };
        pending = true;
      }
      score += g.points;
      questions[q.id] = g;
    }
  }
  return { score, maxScore, pending, questions };
}

// ── Lectura y resumen ─────────────────────────────────────────────────────

const labelOf = (opts: Option[] | undefined, id: string) =>
  opts?.find((o) => o.id === id)?.label ?? id;

/** Respuesta legible (para CSV, notas del CRM y correos). */
export function formatAnswer(q: Question, answers: Answers): string {
  const v = answers[q.id];
  if (isEmpty(v)) return '';
  const other = answers[otherKey(q.id)];
  const opt = (id: string) => (id === OTHER ? `Otro: ${other ?? ''}` : labelOf(q.options, id));
  switch (q.type) {
    case 'radio':
    case 'dropdown':
      return opt(String(v));
    case 'checkbox':
      return (v as string[]).map(opt).join(', ');
    case 'gridRadio':
    case 'gridCheckbox':
      return Object.entries(v as Record<string, string | string[]>)
        .map(
          ([row, cell]) =>
            `${labelOf(q.rows, row)}: ${(Array.isArray(cell) ? cell : [cell]).map((c) => labelOf(q.columns, c)).join(', ')}`,
        )
        .join(' · ');
    case 'file':
      return `${(v as string[]).length} archivo(s)`;
    default:
      return String(v);
  }
}

export interface QuestionSummary {
  questionId: string;
  title: string;
  type: QuestionType;
  answered: number;
  /** Opción, escala, valoración: etiqueta → recuento (en orden). */
  counts?: Array<{ key: string; label: string; count: number }>;
  /** Cuadrículas: fila → columna → recuento. */
  grid?: Array<{ row: string; cells: Array<{ label: string; count: number }> }>;
  average?: number | null;
  /** Escala 0–10: % promotores − % detractores. */
  nps?: number | null;
  /** Textos de «Otro» y respuestas libres, las más recientes primero. */
  texts?: string[];
}

/** Resumen por pregunta (respuestas en orden de más reciente a más antigua). */
export function summarize(
  def: FormDefinition,
  responses: Array<{ answers: Answers }>,
): QuestionSummary[] {
  return allQuestions(def).map((q) => {
    const values = responses.map((r) => r.answers?.[q.id]).filter((v) => !isEmpty(v));
    const out: QuestionSummary = {
      questionId: q.id,
      title: q.title,
      type: q.type,
      answered: values.length,
    };
    if (CHOICE_TYPES.includes(q.type)) {
      const counts = new Map<string, number>((q.options ?? []).map((o) => [o.id, 0]));
      if (q.hasOther) counts.set(OTHER, 0);
      for (const v of values)
        for (const x of Array.isArray(v) ? v : [v])
          counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
      out.counts = [...counts].map(([key, count]) => ({
        key,
        label: key === OTHER ? 'Otro' : labelOf(q.options, key),
        count,
      }));
      if (q.hasOther)
        out.texts = responses
          .map((r) => r.answers?.[otherKey(q.id)])
          .filter((t) => !isEmpty(t))
          .slice(0, 50)
          .map(String);
    } else if (q.type === 'scale' || q.type === 'rating') {
      const min = q.type === 'rating' ? 1 : (q.scale?.min ?? 1);
      const max = q.type === 'rating' ? (q.ratingMax ?? 5) : (q.scale?.max ?? 5);
      const nums = values.map(Number);
      out.counts = Array.from({ length: max - min + 1 }, (_, i) => {
        const n = min + i;
        return { key: String(n), label: String(n), count: nums.filter((x) => x === n).length };
      });
      out.average = nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
        : null;
      if (q.type === 'scale' && min === 0 && max === 10)
        out.nps = nums.length
          ? Math.round(
              ((nums.filter((n) => n >= 9).length - nums.filter((n) => n <= 6).length) /
                nums.length) *
                100,
            )
          : null;
    } else if (GRID_TYPES.includes(q.type)) {
      out.grid = (q.rows ?? []).map((r) => ({
        row: r.label,
        cells: (q.columns ?? []).map((c) => ({
          label: c.label,
          count: values.filter((v) => {
            const cell = (v as Record<string, string | string[]>)[r.id];
            return Array.isArray(cell) ? cell.includes(c.id) : cell === c.id;
          }).length,
        })),
      }));
    } else if (q.type === 'number') {
      const nums = values.map(Number).filter(Number.isFinite);
      out.average = nums.length
        ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
        : null;
      out.texts = nums.slice(0, 50).map(String);
    } else if (q.type !== 'file') {
      out.texts = values.slice(0, 50).map(String);
    }
    return out;
  });
}

// ── Utilidades de edición (puras) ─────────────────────────────────────────

/** Id corto y suficiente dentro de un formulario. */
export function newId(prefix = 'q'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}

export function newQuestion(type: QuestionType): Question {
  const q: Question = { kind: 'question', id: newId(), type, title: '' };
  if (CHOICE_TYPES.includes(type)) q.options = [{ id: newId('o'), label: 'Opción 1' }];
  if (GRID_TYPES.includes(type)) {
    q.rows = [{ id: newId('r'), label: 'Fila 1' }];
    q.columns = [{ id: newId('c'), label: 'Columna 1' }];
  }
  if (type === 'scale') q.scale = { min: 1, max: 5 };
  if (type === 'rating') q.ratingMax = 5;
  if (type === 'file') q.file = { maxFiles: 1, maxSizeMb: 10, accept: [] };
  return q;
}

/** Comprueba la definición antes de guardarla. Lanza con un mensaje legible. */
export function assertValidDefinition(def: FormDefinition): void {
  if (!def || def.version !== 2 || !Array.isArray(def.sections) || def.sections.length === 0)
    throw new Error('El formulario necesita al menos una sección');
  if (def.sections.length > 50) throw new Error('Como mucho 50 secciones');
  const ids = new Set<string>();
  let count = 0;
  for (const s of def.sections) {
    if (!s.id || ids.has(s.id)) throw new Error('Hay secciones con el mismo id');
    ids.add(s.id);
    for (const i of s.items ?? []) {
      count++;
      if (!i.id || ids.has(i.id)) throw new Error('Hay elementos con el mismo id');
      ids.add(i.id);
      if (isQuestion(i)) {
        if (!QUESTION_TYPES.includes(i.type))
          throw new Error(`Tipo de pregunta no válido: ${i.type}`);
        if (CHOICE_TYPES.includes(i.type) && !i.options?.length)
          throw new Error(`«${i.title || 'Pregunta'}»: añade al menos una opción`);
        if (GRID_TYPES.includes(i.type) && (!i.rows?.length || !i.columns?.length))
          throw new Error(`«${i.title || 'Pregunta'}»: la cuadrícula necesita filas y columnas`);
      }
    }
  }
  if (count > 300) throw new Error('Como mucho 300 elementos');
}
