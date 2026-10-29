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
  /** Null mientras sea un prospecto sin ficha de cliente. */
  partnerId: string | null;
  contactId: string | null;
  prospectName?: string | null;
  prospectCompany?: string | null;
  prospectEmail?: string | null;
  prospectPhone?: string | null;
  isProspect?: boolean;
  stageId: string;
  /** NUMERIC: llega como string. */
  amount: string;
  expectedCloseDate: string | null;
  ownerUserId: string | null;
  notes: string | null;
  closedAt: string | null;
  source: string | null;
  lostReason: string | null;
  lastActivityAt: string | null;
  tags?: string[];
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
  tags?: string[];
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

export interface OpportunityLine {
  id?: string;
  /** Clave estable en pantalla (las líneas nuevas aún no tienen id). */
  _key?: string;
  itemId: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  description: string | null;
  quantity: number;
  price: number;
  /** Descuento en %. */
  discount: number;
}

/** Importe neto de una línea (cantidad × precio − descuento %). */
export function lineNet(l: Pick<OpportunityLine, 'quantity' | 'price' | 'discount'>): number {
  return (Number(l.quantity) || 0) * (Number(l.price) || 0) * (1 - (Number(l.discount) || 0) / 100);
}

export type OpportunityDocType = 'SQ' | 'SO' | 'SINV';

export interface OpportunityDocument {
  id: string;
  docType: OpportunityDocType;
  code: string;
  date: string;
  status: string;
  total: string;
  validUntil?: string | null;
}

export const DOC_TYPE_LABEL: Record<OpportunityDocType, string> = {
  SQ: 'Presupuesto',
  SO: 'Pedido',
  SINV: 'Factura',
};

/** Ruta de la ficha de cada tipo de documento. */
export const DOC_ROUTE: Record<OpportunityDocType, (id: string) => string> = {
  SQ: (id) => `/sales/quotes/${id}`,
  SO: (id) => `/sales-orders/${id}`,
  SINV: (id) => `/sales/invoices/${id}`,
};

export interface PartnerSummary {
  /** null = sin permiso para verlo. */
  revenue12m: number | null;
  pendingReceivable: number | null;
  lastPurchaseAt: string | null;
  openQuotes: { count: number; amount: number } | null;
  openOpportunities: { count: number; amount: number };
}

export type TimelineKind = 'activity' | 'opportunity' | 'SQ' | 'SO' | 'SINV';

export interface TimelineEntry {
  kind: TimelineKind;
  id: string;
  at: string;
  title: string;
  detail?: string | null;
  status?: string | null;
  amount?: number | null;
  activityType?: ActivityType;
  done?: boolean;
}

export interface Member {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface CrmSettings {
  lostReasons: string[];
  sources: string[];
  sourceRequired: boolean;
  defaultOwnerUserId: string;
  staleDays: number;
  dormantEnabled: boolean;
  dormantDays: number;
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

/** Oportunidad abierta sin actividad (ni cambios) desde hace `days` días. */
export function isStale(o: Opportunity, days: number, now = new Date()): boolean {
  if ((o.stageKind ?? 'open') !== 'open') return false;
  const last = new Date(o.lastActivityAt ?? o.updatedAt ?? o.createdAt);
  return now.getTime() - last.getTime() > days * 86_400_000;
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
