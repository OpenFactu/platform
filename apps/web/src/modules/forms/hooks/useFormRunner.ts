import { useMemo, useState } from 'react';
import {
  isQuestion,
  nextSectionId,
  validateSection,
  visibleItems,
  visitedPath,
  type AnswerValue,
  type Answers,
  type FormDefinition,
  type Item,
} from '@forms-engine';

/** Baraja estable por semilla (la misma sesión ve siempre el mismo orden). */
function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Quien rellena el formulario: respuestas, sección actual con su historial
 * (para «Atrás» tras un salto), errores y progreso. La lógica es la del motor
 * compartido con el servidor.
 */
export function useFormRunner(
  def: FormDefinition,
  opts: { initial?: Answers; shuffleQuestions?: boolean } = {},
) {
  const [answers, setAnswers] = useState<Answers>(opts.initial ?? {});
  const [history, setHistory] = useState<string[]>([def.sections[0]?.id]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [seed] = useState(() => Math.floor(Math.random() * 100000));

  const currentId = history[history.length - 1];
  const section = def.sections.find((s) => s.id === currentId) ?? def.sections[0];

  const items: Item[] = useMemo(() => {
    const visible = visibleItems(section, answers);
    if (!opts.shuffleQuestions) return visible;
    // Solo se barajan las preguntas; textos e imágenes se quedan donde están.
    const qs = shuffled(visible.filter(isQuestion), seed);
    let k = 0;
    return visible.map((i) => (isQuestion(i) ? qs[k++] : i));
  }, [section, answers, opts.shuffleQuestions, seed]);

  const next = nextSectionId(def, section.id, answers);
  const isLast = next === 'submit';
  const path = visitedPath(def, answers);
  const progress = path.length
    ? Math.round(((path.indexOf(section.id) + 1) / path.length) * 100)
    : 100;

  const set = (id: string, value: AnswerValue | undefined) => {
    setAnswers((a) => {
      const copy = { ...a };
      if (value === undefined) delete copy[id];
      else copy[id] = value;
      return copy;
    });
    setErrors((e) => {
      if (!e[id]) return e;
      const copy = { ...e };
      delete copy[id];
      return copy;
    });
  };

  /** Valida la sección actual; si está bien, avanza. Devuelve si se puede enviar ya. */
  const goNext = (): boolean => {
    const errs = validateSection(def, section.id, answers);
    setErrors(errs);
    if (Object.keys(errs).length) return false;
    if (isLast) return true;
    setHistory((h) => [...h, next]);
    return false;
  };

  const goBack = () => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h));

  return {
    answers,
    set,
    setErrors,
    errors,
    section,
    sectionNumber: path.indexOf(section.id) + 1,
    sectionCount: path.length,
    items,
    isFirst: history.length === 1,
    isLast,
    progress,
    goNext,
    goBack,
    reset: () => {
      setAnswers({});
      setHistory([def.sections[0]?.id]);
      setErrors({});
    },
  };
}

export type FormRunnerState = ReturnType<typeof useFormRunner>;
