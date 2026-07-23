import { apiClient } from '@/shared/http';
import type { Competency, Evaluation, EvaluationCycle } from '../domain/evaluation';

export const evaluationsApi = {
  listCycles: () => apiClient.get<EvaluationCycle[]>('/api/hr/evaluations/cycles'),
  createCycle: (data: Record<string, unknown>) =>
    apiClient.post<EvaluationCycle>('/api/hr/evaluations/cycles', data),
  updateCycle: (id: string, data: Record<string, unknown>) =>
    apiClient.patch<EvaluationCycle>(`/api/hr/evaluations/cycles/${id}`, data),

  listCompetencies: () => apiClient.get<Competency[]>('/api/hr/evaluations/competencies'),
  /**
   * NOTA: bug preexistente en Evaluations.tsx — el guardado de competencias
   * llamaba siempre con método GET (el body se ignoraba y nunca se creaba/
   * actualizaba nada). Se preserva tal cual el método/URL/body en esta
   * migración mecánica para no cambiar comportamiento; no se "adivina" un
   * POST/PATCH que no estaba en el código original.
   */
  saveCompetency: (id: string | undefined, _data: Record<string, unknown>) =>
    id
      ? apiClient.get<Competency>(`/api/hr/evaluations/competencies/${id}`)
      : apiClient.get<Competency>('/api/hr/evaluations/competencies'),

  listByCycle: (cycleId: string) =>
    apiClient.get<Evaluation[]>('/api/hr/evaluations', { query: { cycleId } }),
  get: (id: string) => apiClient.get<Evaluation>(`/api/hr/evaluations/${id}`),
  create: (data: { cycleId: string; employeeId: string }) =>
    apiClient.post<Evaluation>('/api/hr/evaluations', data),
  saveScores: (id: string, scores: unknown) =>
    apiClient.put<Evaluation>(`/api/hr/evaluations/${id}/scores`, { scores }),
  close: (id: string) => apiClient.post<Evaluation>(`/api/hr/evaluations/${id}/close`),
};
