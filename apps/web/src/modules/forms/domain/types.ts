import type { FormDefinition, QuestionSummary, QuestionType, Answers } from '@forms-engine';

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

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  shortText: 'Respuesta corta',
  paragraph: 'Párrafo',
  email: 'Correo',
  phone: 'Teléfono',
  number: 'Número',
  radio: 'Opción única',
  checkbox: 'Casillas',
  dropdown: 'Desplegable',
  scale: 'Escala lineal',
  rating: 'Valoración',
  date: 'Fecha',
  time: 'Hora',
  file: 'Subir archivo',
  gridRadio: 'Cuadrícula de opción única',
  gridCheckbox: 'Cuadrícula de casillas',
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

export const MAP_TARGET_LABEL = {
  prospectName: 'Nombre del prospecto',
  prospectCompany: 'Empresa',
  prospectEmail: 'Correo',
  prospectPhone: 'Teléfono',
  message: 'Mensaje',
} as const;
