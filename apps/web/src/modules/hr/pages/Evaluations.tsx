import { evaluationsApi, employeesApi } from '../api';
import type { EvaluationCycle as Cycle, Competency, Evaluation } from '../domain/evaluation';
import type { Employee } from '../domain/employee';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Button,
  Input,
  Badge,
  useToast,
  Select,
  SearchableSelect,
  NumberInput,
  DatePicker,
  Tabs,
  Table,
} from '@openfactu/ui';
import type { BadgeProps, TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
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

// Estados que puede tener un ciclo: las etiquetas se reutilizan de STATUS_LABEL
// en lugar de repetirlas en el desplegable.
const CYCLE_STATUS_OPTIONS = (['draft', 'active', 'closed'] as const).map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));

const TABS = [
  { key: 'cycles', label: 'Ciclos' },
  { key: 'competencies', label: 'Competencias' },
];

/**
 * `weight` se mantiene numérico en el formulario (es lo que emite NumberInput);
 * el servidor lo guarda como decimal en texto, así que se convierte al abrir y
 * al guardar.
 *
 * Los campos se enumeran a mano en lugar de derivarlos con
 * `Omit<Partial<Competency>, 'weight'>`: `Competency` tiene un índice
 * `[key: string]: unknown`, y `Omit` sobre un tipo con índice descarta todas las
 * propiedades con nombre, dejándolas en `unknown`.
 */
type CompetencyForm = {
  id?: string;
  code?: string;
  name?: string;
  weight: number | null;
  scaleMax?: number;
  isActive?: boolean;
};

export const Evaluations: React.FC = () => {
  const { token, user } = useAuth();
  const { canWrite } = usePagePermissions();
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
  const [editingComp, setEditingComp] = useState<CompetencyForm | null>(null);
  const [openCycle, setOpenCycle] = useState<Cycle | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [scoreEditing, setScoreEditing] = useState<{ evaluationId: string; emp: any } | null>(null);
  // `null` = puntuación sin rellenar (el servidor ya lo guarda como NULL).
  const [scores, setScores] = useState<
    Array<{
      competencyId: string;
      scoreSelf?: number | null;
      scoreManager?: number | null;
      comments?: string;
    }>
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

  // Empleados activos que aún no están en el ciclo abierto.
  const addableEmployeeOptions = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active' && !evaluations.some((ev) => ev.employeeId === e.id))
        .map((e) => ({
          value: e.id,
          label: `${e.firstName} ${e.lastName}`,
          secondaryLabel: e.code,
        })),
    [employees, evaluations],
  );

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
      // El peso viaja como decimal en texto; el formulario lo mantiene numérico.
      await evaluationsApi.saveCompetency(editingComp.id, {
        ...editingComp,
        weight: String(editingComp.weight ?? 1),
      });
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
          // `!= null` y no truthy: un 0 es una puntuación válida y con el
          // check anterior se perdía al reabrir la evaluación.
          return {
            competencyId: c.id,
            scoreSelf: s?.scoreSelf != null ? Number(s.scoreSelf) : null,
            scoreManager: s?.scoreManager != null ? Number(s.scoreManager) : null,
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

  // Índice de empleados para resolver el nombre por fila sin recorrer la lista.
  const employeeById = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );

  const openCycleDetail = (c: Cycle) => {
    setOpenCycle(c);
    fetchEvaluations(c.id);
  };

  const cycleColumns: TableColumn<Cycle>[] = [
    { header: 'Nombre', accessor: 'name', sortable: true, primary: true },
    {
      header: 'Inicio',
      sortable: true,
      sortAccessor: (c) => c.startDate || '',
      cell: (c) => c.startDate?.slice(0, 10),
    },
    {
      header: 'Fin',
      sortable: true,
      sortAccessor: (c) => c.endDate || '',
      cell: (c) => c.endDate?.slice(0, 10),
    },
    {
      header: 'Estado',
      sortable: true,
      sortAccessor: (c) => c.status,
      cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>,
    },
  ];

  const cycleRowActions = (c: Cycle): RowAction[] => [
    { label: 'Abrir', icon: <ClipboardCheck size={14} />, onClick: () => openCycleDetail(c) },
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingCycle(c),
    },
  ];

  const evaluationColumns: TableColumn<Evaluation>[] = [
    {
      header: 'Empleado',
      sortable: true,
      sortAccessor: (ev) => {
        const emp = employeeById[ev.employeeId];
        return emp ? `${emp.firstName} ${emp.lastName}` : ev.employeeId;
      },
      cell: (ev) => {
        const emp = employeeById[ev.employeeId];
        return (
          <span className="font-medium">
            {emp ? `${emp.firstName} ${emp.lastName}` : ev.employeeId}
          </span>
        );
      },
      primary: true,
    },
    {
      header: 'Estado',
      sortable: true,
      sortAccessor: (ev) => ev.status,
      cell: (ev) => <Badge variant={STATUS_VARIANT[ev.status]}>{STATUS_LABEL[ev.status]}</Badge>,
    },
    {
      header: 'Score final',
      align: 'right',
      sortable: true,
      sortAccessor: (ev) => Number(ev.finalScore ?? 0),
      cell: (ev) => (
        <span className="tabular-nums font-bold">
          {ev.finalScore ? Number(ev.finalScore).toFixed(2) : '—'}
        </span>
      ),
    },
  ];

  const evaluationRowActions = (ev: Evaluation): RowAction[] => [
    { label: 'Puntuar', icon: <ClipboardCheck size={14} />, onClick: () => openScores(ev) },
  ];

  const competencyColumns: TableColumn<Competency>[] = [
    { header: 'Código', accessor: 'code', sortable: true, primary: true },
    { header: 'Nombre', accessor: 'name', sortable: true },
    {
      header: 'Peso',
      align: 'right',
      sortable: true,
      sortAccessor: (c) => Number(c.weight ?? 0),
      cell: (c) => <span className="tabular-nums">{Number(c.weight).toFixed(2)}</span>,
    },
    {
      header: 'Escala',
      align: 'right',
      sortable: true,
      sortAccessor: (c) => c.scaleMax,
      cell: (c) => <span className="tabular-nums">{c.scaleMax}</span>,
    },
  ];

  // `weight` llega del servidor como decimal en texto; el formulario lo maneja
  // numérico, de ahí la conversión al abrir la competencia.
  const competencyRowActions = (c: Competency): RowAction[] => [
    {
      label: 'Editar competencia',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => setEditingComp({ ...c, weight: Number(c.weight ?? 1) }),
    },
  ];

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
        {/* Lo que cambia es la vista completa, no un filtro → Tabs. */}
        <Tabs
          items={TABS}
          value={tab}
          onChange={(k) => setTab(k as 'cycles' | 'competencies')}
          variant="segmented"
        />
      </div>

      {tab === 'cycles' && !openCycle && (
        <>
          {canWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setEditingCycle({ status: 'draft' })}>
                <Plus size={14} /> Nuevo ciclo
              </Button>
            </div>
          )}
          {editingCycle && (
            <Card noPadding>
              <form onSubmit={saveCycle} className="p-6 grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  label="Nombre"
                  value={editingCycle.name || ''}
                  onChange={(e) => setEditingCycle({ ...editingCycle, name: e.target.value })}
                  required
                />
                {/* El `required` de los <input type="date"> era redundante:
                    saveCycle ya avisa si falta nombre o fechas. */}
                <DatePicker
                  label="Inicio"
                  value={editingCycle.startDate || null}
                  onChange={(v) => setEditingCycle({ ...editingCycle, startDate: v ?? '' })}
                />
                <DatePicker
                  label="Fin"
                  value={editingCycle.endDate || null}
                  onChange={(v) => setEditingCycle({ ...editingCycle, endDate: v ?? '' })}
                />
                <Select
                  label="Estado"
                  options={CYCLE_STATUS_OPTIONS}
                  value={editingCycle.status || 'draft'}
                  onChange={(v) =>
                    setEditingCycle({ ...editingCycle, status: v as Cycle['status'] })
                  }
                />
                <div className="md:col-span-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditingCycle(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!canWrite}>
                    Guardar
                  </Button>
                </div>
              </form>
            </Card>
          )}
          <Card className="overflow-hidden" noPadding>
            <Table
              columns={cycleColumns}
              data={cycles}
              rowActions={cycleRowActions}
              onRowClick={openCycleDetail}
              emptyMessage="Todavía no hay ciclos de evaluación."
            />
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
              {/* Actúa como acción, no como campo: el valor vuelve siempre a
                  vacío tras añadir al empleado. */}
              <SearchableSelect
                options={addableEmployeeOptions}
                value=""
                onChange={(v) => {
                  if (v) addEvaluation(v);
                }}
                placeholder="— elegir empleado —"
                disabled={!canWrite}
              />
            </div>
            <Table
              columns={evaluationColumns}
              data={evaluations}
              rowActions={evaluationRowActions}
              onRowClick={openScores}
              emptyMessage="Aún no hay empleados en este ciclo."
            />
          </div>
        </Card>
      )}

      {tab === 'competencies' && (
        <>
          {canWrite && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => setEditingComp({ scaleMax: 5, isActive: true, weight: 1 })}
              >
                <Plus size={14} /> Nueva competencia
              </Button>
            </div>
          )}
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
                <NumberInput
                  label="Peso"
                  value={editingComp.weight}
                  onChange={(v) => setEditingComp({ ...editingComp, weight: v })}
                  precision={2}
                  min={0}
                  emptyValue="zero"
                />
                <NumberInput
                  label="Escala (1..N)"
                  value={editingComp.scaleMax ?? 5}
                  onChange={(v) => setEditingComp({ ...editingComp, scaleMax: v ?? 5 })}
                />
                <div className="md:col-span-4 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditingComp(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!canWrite}>
                    Guardar
                  </Button>
                </div>
              </form>
            </Card>
          )}
          <Card className="overflow-hidden" noPadding>
            <Table
              columns={competencyColumns}
              data={competencies}
              rowActions={competencyRowActions}
              onRowClick={(c) => setEditingComp({ ...c, weight: Number(c.weight ?? 1) })}
              emptyMessage="Todavía no hay competencias definidas."
            />
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
                            className="w-20 text-right px-2 py-1 rounded border border-border-default bg-transparent"
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
                            className="w-20 text-right px-2 py-1 rounded border border-border-default bg-transparent"
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
                            className="w-full px-2 py-1 rounded border border-border-default bg-transparent"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-between gap-2 pt-3 border-t">
                <Button size="sm" variant="danger" onClick={closeEvaluation} disabled={!canWrite}>
                  <CheckCircle size={14} /> Cerrar evaluación (calcula final)
                </Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setScoreEditing(null)}>
                    Cerrar
                  </Button>
                  <Button size="sm" onClick={saveScores} disabled={!canWrite}>
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
