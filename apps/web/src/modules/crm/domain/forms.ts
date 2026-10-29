export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'rating'
  | 'nps'
  | 'section';

export type MapTarget =
  | 'prospectName'
  | 'prospectCompany'
  | 'prospectEmail'
  | 'prospectPhone'
  | 'message';

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[];
  mapTo?: MapTarget;
}

export interface FormSettings {
  submitLabel?: string;
  successMessage?: string;
  createLead?: boolean;
  stageId?: string;
  ownerUserId?: string;
  source?: string;
}

export type FormKind = 'form' | 'survey';

export interface CrmForm {
  id: string;
  name: string;
  kind: FormKind;
  slug: string;
  title: string | null;
  intro: string | null;
  fields: FormField[];
  settings: FormSettings;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  publicUrl?: string;
  responses?: number;
  lastResponseAt?: string | null;
}

export type Answers = Record<string, string | number | string[]>;

export interface FormResponse {
  id: string;
  answers: Answers;
  createdAt: string;
  partnerName?: string | null;
  contactName?: string | null;
  opportunityId?: string | null;
  opportunityTitle?: string | null;
}

export interface FieldResult {
  fieldId: string;
  label: string;
  type: FieldType;
  answered: number;
  counts?: Record<string, number>;
  average?: number | null;
  nps?: number | null;
  samples?: string[];
}

export interface FormInvite {
  id: string;
  contactId: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  partnerName?: string | null;
  link: string;
  sentAt: string | null;
  respondedAt: string | null;
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Texto corto',
  textarea: 'Texto largo',
  email: 'Correo',
  phone: 'Teléfono',
  number: 'Número',
  date: 'Fecha',
  select: 'Desplegable',
  radio: 'Opción única',
  checkbox: 'Casillas (varias)',
  rating: 'Valoración 1–5',
  nps: 'Recomendación 0–10 (NPS)',
  section: 'Sección / texto',
};

export const MAP_TARGET_LABEL: Record<MapTarget, string> = {
  prospectName: 'Nombre del prospecto',
  prospectCompany: 'Empresa',
  prospectEmail: 'Correo',
  prospectPhone: 'Teléfono',
  message: 'Mensaje',
};

export const CHOICE_TYPES: FieldType[] = ['select', 'radio', 'checkbox'];

export function newField(type: FieldType): FormField {
  return {
    id: crypto.randomUUID().slice(0, 8),
    type,
    label: type === 'section' ? 'Nueva sección' : 'Nueva pregunta',
    ...(CHOICE_TYPES.includes(type) ? { options: ['Opción 1', 'Opción 2'] } : {}),
  };
}

/** Errores de cliente antes de enviar (el servidor vuelve a validar). */
export function missingRequired(fields: FormField[], answers: Answers): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (!f.required || f.type === 'section') continue;
    const v = answers[f.id];
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0))
      errors[f.id] = 'Obligatorio';
  }
  return errors;
}
