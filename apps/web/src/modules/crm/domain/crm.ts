import type { BadgeVariant } from '@openfactu/ui';

export type StageKind = 'open' | 'won' | 'lost';

export interface OpportunityStage {
  id: string;
  name: string;
  sortOrder: number;
  probability: number;
  kind: StageKind;
  opportunityCount?: number;
}

export interface Opportunity {
  id: string;
  title: string;
  partnerId: string;
  contactId: string | null;
  stageId: string;
  /** NUMERIC: llega como string. */
  amount: string;
  expectedCloseDate: string | null;
  ownerUserId: string | null;
  notes: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  partnerName?: string;
  contactName?: string | null;
  stageName?: string;
  stageKind?: StageKind;
  stageProbability?: number;
}

export interface Contact {
  id: string;
  partnerId: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isMain: boolean;
  notes: string | null;
  partnerName?: string;
}

export type ActivityType = 'call' | 'meeting' | 'email' | 'note' | 'task';

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string;
  body: string | null;
  partnerId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  dueAt: string | null;
  doneAt: string | null;
  ownerUserId: string | null;
  createdAt: string;
  partnerName?: string | null;
  contactName?: string | null;
  opportunityTitle?: string | null;
}

export const STAGE_KIND_LABEL: Record<StageKind, string> = {
  open: 'Abierta',
  won: 'Ganada',
  lost: 'Perdida',
};

export const STAGE_KIND_VARIANT: Record<StageKind, BadgeVariant> = {
  open: 'info',
  won: 'success',
  lost: 'neutral',
};

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  call: 'Llamada',
  meeting: 'Reunión',
  email: 'Correo',
  note: 'Nota',
  task: 'Tarea',
};

export const ACTIVITY_TYPE_OPTIONS = (Object.keys(ACTIVITY_TYPE_LABEL) as ActivityType[]).map(
  (value) => ({ value, label: ACTIVITY_TYPE_LABEL[value] }),
);

/** Una actividad pendiente con fecha anterior a hoy (la de hoy aún no está vencida). */
export function isOverdue(a: Pick<Activity, 'dueAt' | 'doneAt'>, now = new Date()): boolean {
  if (a.doneAt || !a.dueAt) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(a.dueAt.slice(0, 10) + 'T23:59:59') < today;
}

/** Importe ponderado por la probabilidad de la etapa. */
export function weightedAmount(o: Pick<Opportunity, 'amount' | 'stageProbability'>): number {
  return (Number(o.amount) || 0) * ((o.stageProbability ?? 0) / 100);
}

export interface StageColumn {
  stage: OpportunityStage;
  items: Opportunity[];
  total: number;
}

/** Agrupa las oportunidades en las columnas del tablero, en el orden del embudo. */
export function groupByStage(
  stages: OpportunityStage[],
  opportunities: Opportunity[],
): StageColumn[] {
  return stages.map((stage) => {
    const items = opportunities.filter((o) => o.stageId === stage.id);
    return { stage, items, total: items.reduce((sum, o) => sum + (Number(o.amount) || 0), 0) };
  });
}
