import type {
  FormDefinition,
  QuestionSummary,
  QuestionType,
  Answers,
  TextStyle,
  TitleEffect,
} from '@forms-engine';

export type { FormDefinition, Answers };

/** Espejo de core/forms/settings.ts del servidor (solo tipos). */
export interface FormSettings {
  submitLabel?: string;
  successMessage?: string;
  closedMessage?: string;
  closesAt?: string | null;
  maxResponses?: number | null;
  collectEmail: 'none' | 'optional' | 'required';
  onePerPerson: boolean;
  allowEdit: boolean;
  showProgress: boolean;
  shuffleQuestions: boolean;
  notifyUserIds: string[];
  notifyEmail: boolean;
  quiz: {
    enabled: boolean;
    release: 'immediate' | 'later' | 'never';
    showCorrect: boolean;
    released?: boolean;
  };
  crm: { createLead: boolean; stageId?: string; ownerUserId?: string; source?: string };
}

export interface FormTheme {
  accent?: string;
  background?: string;
  headerAssetId?: string;
  titleEffect?: TitleEffect;
}

export interface FormDoc {
  id: string;
  name: string;
  kind: 'form' | 'survey';
  slug: string;
  title: string | null;
  intro: string | null;
  definition: FormDefinition;
  settings: FormSettings;
  theme: FormTheme;
  isActive: boolean;
  publicUrl: string;
  responses: number;
  updatedAt: string;
}

export interface FormListItem {
  id: string;
  name: string;
  kind: 'form' | 'survey';
  slug: string;
  isActive: boolean;
  updatedAt: string;
  responses: number;
  lastResponseAt: string | null;
}

export interface FormResponseRow {
  id: string;
  answers: Answers;
  respondentEmail: string | null;
  score: string | null;
  maxScore: string | null;
  gradedAt: string | null;
  partnerName?: string | null;
  contactName?: string | null;
  opportunityId?: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface QuestionGrade {
  points: number;
  max: number;
  correct: boolean | null;
}

export interface FormResponseDetail extends FormResponseRow {
  grades: Record<string, number>;
  files: Array<{ id: string; fileName: string; mime: string; size: number }>;
  grading: {
    score: number;
    maxScore: number;
    pending: boolean;
    questions: Record<string, QuestionGrade>;
  } | null;
}

export interface FormSummary {
  total: number;
  questions: QuestionSummary[];
  quiz: { average: number | null; maxScore: number | null } | null;
}

export interface FormInviteRow {
  id: string;
  name: string | null;
  email: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  link: string;
}

/** Claves de i18n: se traducen al pintar con `t()`. */
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  shortText: 'forms.questionType.shortText',
  paragraph: 'forms.questionType.paragraph',
  email: 'forms.questionType.email',
  phone: 'forms.questionType.phone',
  number: 'forms.questionType.number',
  radio: 'forms.questionType.radio',
  checkbox: 'forms.questionType.checkbox',
  dropdown: 'forms.questionType.dropdown',
  scale: 'forms.questionType.scale',
  rating: 'forms.questionType.rating',
  date: 'forms.questionType.date',
  time: 'forms.questionType.time',
  file: 'forms.questionType.file',
  gridRadio: 'forms.questionType.gridRadio',
  gridCheckbox: 'forms.questionType.gridCheckbox',
};

/** Grupos del selector de tipo, como en el menú de Google. */
export const QUESTION_TYPE_GROUPS: QuestionType[][] = [
  ['shortText', 'paragraph'],
  ['radio', 'checkbox', 'dropdown'],
  ['file'],
  ['scale', 'rating', 'gridRadio', 'gridCheckbox'],
  ['date', 'time'],
  ['email', 'phone', 'number'],
];

/** Claves de i18n: se traducen al pintar con `t()`. */
export const MAP_TARGET_LABEL = {
  prospectName: 'forms.mapTarget.prospectName',
  prospectCompany: 'forms.mapTarget.prospectCompany',
  prospectEmail: 'forms.mapTarget.prospectEmail',
  prospectPhone: 'forms.mapTarget.prospectPhone',
  message: 'forms.mapTarget.message',
} as const;

/** Claves de i18n: se traducen al pintar con `t()`. */
export const TITLE_EFFECT_LABEL: Record<TitleEffect, string> = {
  none: 'forms.titleEffect.none',
  gradient: 'forms.titleEffect.gradient',
  gradientAnimated: 'forms.titleEffect.gradientAnimated',
  typewriter: 'forms.titleEffect.typewriter',
  reveal: 'forms.titleEffect.reveal',
  scramble: 'forms.titleEffect.scramble',
  shimmer: 'forms.titleEffect.shimmer',
};

/** Claves de i18n: se traducen al pintar con `t()`. */
export const TEXT_STYLE_LABEL: Record<TextStyle, string> = {
  body: 'forms.textStyle.body',
  lead: 'forms.textStyle.lead',
  small: 'forms.textStyle.small',
  quote: 'forms.textStyle.quote',
  callout: 'forms.textStyle.callout',
};

/** `label` es una clave de i18n. */
export const TITLE_EFFECT_OPTIONS = (Object.keys(TITLE_EFFECT_LABEL) as TitleEffect[]).map((k) => ({
  value: k,
  label: TITLE_EFFECT_LABEL[k],
}));

/** Ayuda del formato ligero de los textos (ver domain/richText). Clave de i18n. */
export const RICH_TEXT_HINT = 'forms.richTextHint';
