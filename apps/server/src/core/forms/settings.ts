/**
 * Ajustes y tema de un formulario: tipos, valores por defecto y saneado de lo
 * que llega del editor. Los formularios del CRM (v1) guardaban `createLead`,
 * `stageId`… en la raíz de `settings`; `normalizeSettings` los pasa a `crm`.
 */
import { TITLE_EFFECTS, type TitleEffect } from './engine';

export interface FormSettings {
  submitLabel?: string;
  successMessage?: string;
  closedMessage?: string;
  /** ISO; a partir de entonces no acepta respuestas. */
  closesAt?: string | null;
  maxResponses?: number | null;
  collectEmail: 'none' | 'optional' | 'required';
  /** Una por persona: por correo si se pide, si no por el navegador. */
  onePerPerson: boolean;
  /** Quien responde recibe un enlace para cambiar su respuesta. */
  allowEdit: boolean;
  showProgress: boolean;
  shuffleQuestions: boolean;
  /** Usuarios avisados de cada respuesta nueva. */
  notifyUserIds: string[];
  /** Además del aviso en la campana, correo a esos usuarios. */
  notifyEmail: boolean;
  quiz: {
    enabled: boolean;
    /** Cuándo ve la nota quien responde. */
    release: 'immediate' | 'later' | 'never';
    showCorrect: boolean;
    /** Con release 'later': ya se han publicado. */
    released?: boolean;
  };
  /** Solo actúa con el CRM activo. */
  crm: { createLead: boolean; stageId?: string; ownerUserId?: string; source?: string };
}

export interface FormTheme {
  accent?: string;
  background?: string;
  headerAssetId?: string;
  /** Efecto del título del formulario. */
  titleEffect?: TitleEffect;
}

export const DEFAULT_SETTINGS: FormSettings = {
  collectEmail: 'none',
  onePerPerson: false,
  allowEdit: false,
  showProgress: true,
  shuffleQuestions: false,
  notifyUserIds: [],
  notifyEmail: false,
  quiz: { enabled: false, release: 'immediate', showCorrect: true },
  crm: { createLead: false },
};

const str = (v: unknown, max = 500) =>
  v == null || v === '' ? undefined : String(v).slice(0, max);
const HEX = /^#[0-9a-f]{6}$/i;

/** Ajustes guardados (v1 o v2) completados con los valores por defecto. */
export function normalizeSettings(raw: unknown): FormSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as any;
  const crmLegacy = 'createLead' in s ? s : {};
  const quiz = s.quiz ?? {};
  const crm = s.crm ?? crmLegacy;
  const maxResponses = Number(s.maxResponses);
  return {
    submitLabel: str(s.submitLabel, 60),
    successMessage: str(s.successMessage, 1000),
    closedMessage: str(s.closedMessage, 1000),
    closesAt:
      s.closesAt && !Number.isNaN(new Date(s.closesAt).getTime()) ? String(s.closesAt) : null,
    maxResponses: Number.isInteger(maxResponses) && maxResponses > 0 ? maxResponses : null,
    collectEmail: ['optional', 'required'].includes(s.collectEmail) ? s.collectEmail : 'none',
    onePerPerson: !!s.onePerPerson,
    allowEdit: !!s.allowEdit,
    showProgress: s.showProgress !== false,
    shuffleQuestions: !!s.shuffleQuestions,
    notifyUserIds: Array.isArray(s.notifyUserIds) ? s.notifyUserIds.map(String).slice(0, 20) : [],
    notifyEmail: !!s.notifyEmail,
    quiz: {
      enabled: !!quiz.enabled,
      release: ['later', 'never'].includes(quiz.release) ? quiz.release : 'immediate',
      showCorrect: quiz.showCorrect !== false,
      released: !!quiz.released,
    },
    crm: {
      createLead: !!crm.createLead,
      stageId: str(crm.stageId, 100),
      ownerUserId: str(crm.ownerUserId, 100),
      source: str(crm.source, 100),
    },
  };
}

export function normalizeTheme(raw: unknown): FormTheme {
  const t = (raw && typeof raw === 'object' ? raw : {}) as any;
  return {
    accent: HEX.test(t.accent ?? '') ? t.accent : undefined,
    background: HEX.test(t.background ?? '') ? t.background : undefined,
    headerAssetId: str(t.headerAssetId, 100),
    titleEffect: TITLE_EFFECTS.includes(t.titleEffect) ? t.titleEffect : undefined,
  };
}

/**
 * ¿Acepta respuestas ahora? Devuelve el motivo si no: lo enseña la página
 * pública en vez del formulario.
 */
export function closedReason(
  form: { isActive: boolean },
  settings: FormSettings,
  responseCount: number,
  now = new Date(),
): string | null {
  const msg = settings.closedMessage || 'Este formulario ya no acepta respuestas.';
  if (!form.isActive) return msg;
  if (settings.closesAt && new Date(settings.closesAt) <= now) return msg;
  if (settings.maxResponses && responseCount >= settings.maxResponses) return msg;
  return null;
}
