import { apiClient, buildQuery } from '@/shared/http';

export interface CrmPeriod {
  from: string;
  to: string;
}

export interface ForecastReport {
  open: Array<{ month: string | null; count: number; amount: number; weighted: number }>;
  won: Array<{ month: string; count: number; amount: number }>;
}
export interface FunnelReport {
  cohort: number;
  stages: Array<{
    stageId: string;
    name: string;
    kind: string;
    reached: number;
    conversion: number | null;
    avgDays: number | null;
  }>;
}
export interface LostReasonRow {
  reason: string;
  count: number;
  amount: number;
}
export interface SourceRow {
  source: string;
  created: number;
  won: number;
  lost: number;
  wonAmount: number;
  winRate: number | null;
}
export interface OwnerActivityRow {
  ownerUserId: string | null;
  name: string;
  done: Record<string, number>;
  totalDone: number;
  overdue: number;
  won: number;
  wonAmount: number;
}
export interface SurveyReportRow {
  formId: string;
  name: string;
  responses: number;
  nps: number | null;
  months: Array<{ month: string; responses: number; nps: number | null }>;
}

const get = <T>(name: string, p: CrmPeriod) =>
  apiClient.get<T>(`/api/crm/reports/${name}${buildQuery({ from: p.from, to: p.to })}`);

export const crmReportsApi = {
  forecast: (p: CrmPeriod) => get<ForecastReport>('forecast', p),
  funnel: (p: CrmPeriod) => get<FunnelReport>('funnel', p),
  lostReasons: (p: CrmPeriod) => get<LostReasonRow[]>('lost-reasons', p),
  sources: (p: CrmPeriod) => get<SourceRow[]>('sources', p),
  activity: (p: CrmPeriod) => get<OwnerActivityRow[]>('activity', p),
  surveys: (p: CrmPeriod) => get<SurveyReportRow[]>('surveys', p),
};
