import { evaluationsApi, employeesApi } from '../api';
import type { EvaluationCycle as Cycle, Competency, Evaluation } from '../domain/evaluation';
import type { Employee } from '../domain/employee';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Badge, useToast } from '@openfactu/ui';
import type { BadgeProps } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ClipboardCheck, Plus, Pencil, Trash2, X, Save, CheckCircle } from 'lucide-react';
import { ApiError } from '@/shared/http';

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  draft: 'neutral',
  active: 'success',
  closed: 'info',
  pending: 'warning',
  self_done: 'info',
  manager_done: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  closed: 'Cerrado',
  pending: 'Pendiente',
  self_done: 'Autoevaluado',
  manager_done: 'Evaluado',
};

export const Evaluations: React.FC = () => {
  const { token, user } = useAuth();
  const toast = useToast();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );
  const [tab, setTab] = useState<'cycles' | 'competencies'>('cycles');
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editingCycle, setEditingCycle] = useState<Partial<Cycle> | null>(null);
  const [editingComp, setEditingComp] = useState<Partial<Competency> | null>(null);
  const [openCycle, setOpenCycle] = useState<Cycle | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [scoreEditing, setScoreEditing] = useState<{ evaluationId: string; emp: any } | null>(null);
  const [scores, setScores] = useState<
    Array<{ competencyId: string; scoreSelf?: number; scoreManager?: number; comments?: string }>
  >([]);

  const fetchAll = async () => {
    const [c, comp, emps] = await Promise.all([
      evaluationsApi.listCycles(),
      evaluationsApi.listCompetencies(),
      employeesApi.list(),
    ]);
    setCycles(Array.isArray(c) ? c : []);
    setCompetencies(Array.isArray(comp) ? comp : []);
    setEmployees(Array.isArray(emps) ? emps : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const fetchEvaluations = async (cycleId: string) => {
    const d = await evaluationsApi.listByCycle(cycleId);
    setEvaluations(Array.isArray(d) ? d : []);
  };

  const saveCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCycle?.name || !editingCycle?.startDate || !editingCycle?.endDate) {
      toast.error('Nombre y fechas obligatorios');
      return;
    }
    const isNew = !editingCycle.id;
    try {
      if (isNew) {
        await evaluationsApi.createCycle(editingCycle);
      } else {
        await evaluationsApi.updateCycle(editingCycle.id!, editingCycle);
      }
      toast.success('Guardado');
      setEditingCycle(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const saveComp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingComp?.code || !editingComp?.name) {
      toast.error('Código y nombre obligatorios');
      return;
    }
    try {
      await evaluationsApi.saveCompetency(editingComp.id, editingComp);
      setEditingComp(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const addEvaluation = async (employeeId: string) => {
    if (!openCycle) return;
    await evaluationsApi.create({ cycleId: openCycle.id, employeeId });
    fetchEvaluations(openCycle.id);
  };

  const openScores = async (ev: Evaluation) => {
    const emp = employees.find((e) => e.id === ev.employeeId);
    setScoreEditing({ evaluationId: ev.id, emp });
    const d = await evaluationsApi.get(ev.id);
    const map = new Map((d.scores || []).map((s: any) => [s.competencyId, s]));
    setScores(
      competencies
        .filter((c) => c.isActive)
        .map((c) => {
          const s: any = map.get(c.id);
          return {
            competencyId: c.id,
            scoreSelf: s?.scoreSelf ? Number(s.scoreSelf) : undefined,
            scoreManager: s?.scoreManager ? Number(s.scoreManager) : undefined,
            comments: s?.comments || '',
          };
        }),
    );
  };

  const saveScores = async () => {
    if (!scoreEditing) return;
    try {
      await evaluationsApi.saveScores(scoreEditing.evaluationId, scores);
      toast.success('Puntuaciones guardadas');
      setScoreEditing(null);
      if (openCycle) fetchEvaluations(openCycle.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const closeEvaluation = async () => {
    if (!scoreEditing) return;
    const evaluationId = scoreEditing.evaluationId;
    await saveScores();
    try {
      await evaluationsApi.close(evaluationId);
      toast.success('Evaluación cerrada');
      setScoreEditing(null);
      if (openCycle) fetchEvaluations(openCycle.id);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'No se pudo cerrar',
      );
    }
  };

  return (
    <div className="p-4 w-full space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <ClipboardCheck className="text-indigo-600" size={32} /> Evaluaciones
          </h1>
          <p className="text-slate-500 text-sm">
            Ciclos de evaluación con competencias ponderadas. Al cerrar una evaluación se calcula la
            puntuación final como Σ(score × peso) / Σpeso.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setTab('cycles')}
            className={
              'px-3 py-1.5 text-sm font-bold ' +
              (tab === 'cycles' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900')
            }
          >
            Ciclos
          </button>
          <button
            onClick={() => setTab('competencies')}
            className={
              'px-3 py-1.5 text-sm font-bold ' +
              (tab === 'competencies' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-900')
            }
          >
            Competencias
          </button>
        </div>
      </div>

      {tab === 'cycles' && !openCycle && (
        <>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setEditingCycle({ status: 'draft' })}>
              <Plus size={14} /> Nuevo ciclo
            </Button>
          </div>
          {editingCycle && (
            <Card noPadding>
              <form onSubmit={saveCycle} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  label="Nombre"
                  value={editingCycle.name || ''}
                  onChange={(e) => setEditingCycle({ ...editingCycle, name: e.target.value })}
                  required
                />
                <Input
                  label="Inicio"
                  type="date"
                  value={editingCycle.startDate || ''}
                  onChange={(e) => setEditingCycle({ ...editingCycle, startDate: e.target.value })}
                  required
                />
                <Input
                  label="Fin"
                  type="date"
                  value={editingCycle.endDate || ''}
                  onChange={(e) => setEditingCycle({ ...editingCycle, endDate: e.target.value })}
                  required
                />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Estado
                  </label>
                  <select
                    value={editingCycle.status || 'draft'}
                    onChange={(e) =>
                      setEditingCycle({ ...editingCycle, status: e.target.value as any })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    <option value="draft">Borrador</option>
                    <option value="active">Activo</option>
                    <option value="closed">Cerrado</option>
                  </select>
                </div>
                <div className="md:col-span-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditingCycle(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Guardar</Button>
                </div>
              </form>
            </Card>
          )}
          <Card noPadding>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Inicio</th>
                  <th className="p-3">Fin</th>
                  <th className="p-3">Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3 font-bold">{c.name}</td>
                    <td className="p-3">{c.startDate?.slice(0, 10)}</td>
                    <td className="p-3">{c.endDate?.slice(0, 10)}</td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setOpenCycle(c);
                            fetchEvaluations(c.id);
                          }}
                        >
                          Abrir
                        </Button>
                        <button
                          onClick={() => setEditingCycle(c)}
                          className="text-slate-500 hover:text-indigo-600"
                        >
                          <Pencil size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'cycles' && openCycle && (
        <Card noPadding>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{openCycle.name}</h2>
                <p className="text-xs text-slate-500">
                  {openCycle.startDate?.slice(0, 10)} → {openCycle.endDate?.slice(0, 10)}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setOpenCycle(null)}>
                ← Volver
              </Button>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Añadir empleado al ciclo
              </label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addEvaluation(e.target.value);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="">— elegir empleado —</option>
                {employees
                  .filter(
                    (e) =>
                      e.status === 'active' && !evaluations.some((ev) => ev.employeeId === e.id),
                  )
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code} — {e.firstName} {e.lastName}
                    </option>
                  ))}
              </select>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="p-3">Empleado</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Score final</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => {
                  const emp = employees.find((e) => e.id === ev.employeeId);
                  return (
                    <tr key={ev.id} className="border-b">
                      <td className="p-3 font-medium">
                        {emp ? `${emp.firstName} ${emp.lastName}` : ev.employeeId}
                      </td>
                      <td className="p-3">
                        <Badge variant={STATUS_VARIANT[ev.status]}>{STATUS_LABEL[ev.status]}</Badge>
                      </td>
                      <td className="p-3 text-right tabular-nums font-bold">
                        {ev.finalScore ? Number(ev.finalScore).toFixed(2) : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="secondary" onClick={() => openScores(ev)}>
                          Puntuar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'competencies' && (
        <>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => setEditingComp({ scaleMax: 5, isActive: true, weight: '1' })}
            >
              <Plus size={14} /> Nueva competencia
            </Button>
          </div>
          {editingComp && (
            <Card noPadding>
              <form onSubmit={saveComp} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  label="Código"
                  value={editingComp.code || ''}
                  onChange={(e) => setEditingComp({ ...editingComp, code: e.target.value })}
                  required
                />
                <div className="md:col-span-2">
                  <Input
                    label="Nombre"
                    value={editingComp.name || ''}
                    onChange={(e) => setEditingComp({ ...editingComp, name: e.target.value })}
                    required
                  />
                </div>
                <Input
                  label="Peso"
                  type="number"
                  step="0.01"
                  value={String(editingComp.weight ?? '1')}
                  onChange={(e) => setEditingComp({ ...editingComp, weight: e.target.value })}
                />
                <Input
                  label="Escala (1..N)"
                  type="number"
                  value={String(editingComp.scaleMax ?? 5)}
                  onChange={(e) =>
                    setEditingComp({ ...editingComp, scaleMax: Number(e.target.value) })
                  }
                />
                <div className="md:col-span-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditingComp(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Guardar</Button>
                </div>
              </form>
            </Card>
          )}
          <Card noPadding>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="p-3">Código</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3 text-right">Peso</th>
                  <th className="p-3 text-right">Escala</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {competencies.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="p-3 font-mono text-xs">{c.code}</td>
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-right tabular-nums">{Number(c.weight).toFixed(2)}</td>
                    <td className="p-3 text-right tabular-nums">{c.scaleMax}</td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setEditingComp(c)}
                        className="text-slate-500 hover:text-indigo-600"
                      >
                        <Pencil size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {/* Modal de puntuación */}
      {scoreEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-w-3xl w-full max-h-[85vh] overflow-auto" noPadding>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold">Puntuar evaluación</h2>
                  <p className="text-xs text-slate-500">
                    {scoreEditing.emp?.firstName} {scoreEditing.emp?.lastName}
                  </p>
                </div>
                <button
                  onClick={() => setScoreEditing(null)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b">
                    <th className="p-2">Competencia</th>
                    <th className="p-2 text-right">Auto</th>
                    <th className="p-2 text-right">Manager</th>
                    <th className="p-2">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s, i) => {
                    const c = competencies.find((c) => c.id === s.competencyId);
                    return (
                      <tr key={s.competencyId} className="border-b">
                        <td className="p-2 font-medium">
                          {c?.name}{' '}
                          <span className="text-xs text-slate-400">
                            ×{Number(c?.weight || 1).toFixed(1)}
                          </span>
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={c?.scaleMax || 5}
                            step={0.5}
                            value={s.scoreSelf ?? ''}
                            onChange={(e) => {
                              const next = [...scores];
                              next[i] = {
                                ...s,
                                scoreSelf:
                                  e.target.value === '' ? undefined : Number(e.target.value),
                              };
                              setScores(next);
                            }}
                            className="w-20 text-right px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            type="number"
                            min={0}
                            max={c?.scaleMax || 5}
                            step={0.5}
                            value={s.scoreManager ?? ''}
                            onChange={(e) => {
                              const next = [...scores];
                              next[i] = {
                                ...s,
                                scoreManager:
                                  e.target.value === '' ? undefined : Number(e.target.value),
                              };
                              setScores(next);
                            }}
                            className="w-20 text-right px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={s.comments || ''}
                            onChange={(e) => {
                              const next = [...scores];
                              next[i] = { ...s, comments: e.target.value };
                              setScores(next);
                            }}
                            className="w-full px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-between gap-2 pt-3 border-t">
                <Button size="sm" variant="danger" onClick={closeEvaluation}>
                  <CheckCircle size={14} /> Cerrar evaluación (calcula final)
                </Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setScoreEditing(null)}>
                    Cerrar
                  </Button>
                  <Button size="sm" onClick={saveScores}>
                    <Save size={14} /> Guardar
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default Evaluations;
