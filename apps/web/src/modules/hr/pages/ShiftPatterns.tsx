import { hrApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import {
  Repeat,
  Plus,
  Save,
  Trash2,
  Calendar,
  Paintbrush,
  Copy,
  Eraser,
  Wand2,
} from 'lucide-react';

interface PatternSlot {
  week: number;
  dayOfWeek: number;
  shiftTemplateId: string;
}

interface Pattern {
  id: string;
  name: string;
  cycleWeeks: number;
  slots: PatternSlot[];
  isActive: boolean;
}

interface Assignment {
  id: string;
  patternId: string;
  employeeId: string;
  weekOffset: number;
  validFrom: string;
  validTo: string | null;
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const ShiftPatterns: React.FC = () => {
  const { token, user } = useAuth();
  const [list, setList] = useState<Pattern[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [editing, setEditing] = useState<Pattern | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [expanding, setExpanding] = useState({ from: '', to: '' });
  // Plantilla "pincel": al hacer click en una celda vacía, se aplica este turno.
  const [brush, setBrush] = useState<string>('');
  const toast = useToast();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const fetchAll = async () => {
    const [p, t, e] = await Promise.all([
      hrApi.get<any>('/api/hr/shift-patterns'),
      hrApi.get<any>('/api/hr/shift-templates'),
      hrApi.get<any>('/api/hr/employees'),
    ]);
    setList(Array.isArray(p) ? p : []);
    setTemplates(Array.isArray(t) ? t : []);
    setEmployees(Array.isArray(e) ? e : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const openEdit = async (p: Pattern) => {
    const r = await hrApi.get<any>(`/api/hr/shift-patterns/${p.id}`);
    setEditing(r);
    setAssignments(Array.isArray(r.assignments) ? r.assignments : []);
  };

  const newPattern = () => {
    setEditing({
      id: '',
      name: 'Nuevo patrón',
      cycleWeeks: 1,
      slots: [],
      isActive: true,
    });
    setAssignments([]);
  };

  const setSlot = (week: number, dayOfWeek: number, shiftTemplateId: string) => {
    if (!editing) return;
    const slots = (editing.slots || []).filter(
      (s) => !(s.week === week && s.dayOfWeek === dayOfWeek),
    );
    if (shiftTemplateId) slots.push({ week, dayOfWeek, shiftTemplateId });
    setEditing({ ...editing, slots });
  };

  const slotOf = (week: number, dayOfWeek: number) =>
    editing?.slots?.find((s) => s.week === week && s.dayOfWeek === dayOfWeek)?.shiftTemplateId ||
    '';

  // Rellena varios días de una semana con la misma plantilla (o vacío).
  const fillRow = (week: number, days: number[], shiftTemplateId: string) => {
    if (!editing) return;
    const slots = (editing.slots || []).filter(
      (s) => !(s.week === week && days.includes(s.dayOfWeek)),
    );
    if (shiftTemplateId) {
      for (const d of days) slots.push({ week, dayOfWeek: d, shiftTemplateId });
    }
    setEditing({ ...editing, slots });
  };

  // Copia la semana origen sobre la destino.
  const copyWeek = (fromWeek: number, toWeek: number) => {
    if (!editing) return;
    const others = (editing.slots || []).filter((s) => s.week !== toWeek);
    const source = (editing.slots || []).filter((s) => s.week === fromWeek);
    const cloned = source.map((s) => ({ ...s, week: toWeek }));
    setEditing({ ...editing, slots: [...others, ...cloned] });
  };

  // Aplica una plantilla a toda la matriz para un patrón típico.
  const applyPreset = (preset: 'lunVie' | 'todos' | 'limpiar') => {
    if (!editing) return;
    if (preset === 'limpiar') {
      setEditing({ ...editing, slots: [] });
      return;
    }
    if (!brush) {
      toast.error('Elige antes una plantilla "pincel" arriba');
      return;
    }
    const days = preset === 'lunVie' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7];
    const slots: PatternSlot[] = [];
    for (let w = 0; w < editing.cycleWeeks; w++) {
      for (const d of days) slots.push({ week: w, dayOfWeek: d, shiftTemplateId: brush });
    }
    setEditing({ ...editing, slots });
  };

  const save = async () => {
    if (!editing) return;
    const isNew = !editing.id;
    const r = await hrApi.raw(isNew ? 'POST' : 'PATCH', isNew ? '/api/hr/shift-patterns' : `/api/hr/shift-patterns/${editing.id}`, editing);
    const d = r.data;
    if (!r.ok) {
      toast.error(d.error);
      return;
    }
    toast.success('Guardado');
    setEditing(d);
    fetchAll();
  };

  const addAssignment = async (employeeId: string, validFrom: string, weekOffset: number) => {
    if (!editing?.id) {
      toast.error('Guarda el patrón antes de asignar empleados');
      return;
    }
    const r = await hrApi.raw('POST', `/api/hr/shift-patterns/${editing.id}/assignments`, { employeeId, validFrom, weekOffset });
    if (!r.ok) {
      const d = r.data;
      toast.error(d.error);
      return;
    }
    openEdit(editing);
  };

  const removeAssignment = async (a: Assignment) => {
    await hrApi.raw('DELETE', `/api/hr/shift-patterns/${editing!.id}/assignments/${a.id}`);
    if (editing) openEdit(editing);
  };

  const expand = async () => {
    if (!editing?.id) return;
    if (!expanding.from || !expanding.to) {
      toast.error('Indica from y to');
      return;
    }
    const r = await hrApi.raw('POST', `/api/hr/shift-patterns/${editing.id}/expand`, expanding);
    const d = r.data;
    if (!r.ok) {
      toast.error(d.error);
      return;
    }
    toast.success(`Generadas ${d.created} asignaciones de turno`);
  };

  return (
    <div className="p-4 w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <Repeat className="text-indigo-600" size={32} /> Patrones de turno
          </h1>
          <p className="text-slate-500">
            Rotaciones cíclicas que se aplican a empleados con offsets distintos. Al "expandir" se
            generan asignaciones reales por día.
          </p>
        </div>
        <Button size="sm" onClick={newPattern}>
          <Plus size={14} /> Nuevo patrón
        </Button>
      </div>

      {!editing && (
        <Card noPadding>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Nombre</th>
                <th className="p-3">Semanas ciclo</th>
                <th className="p-3">Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3">{p.cycleWeeks}</td>
                  <td className="p-3">{p.isActive ? 'Sí' : 'No'}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && (
        <div className="space-y-4">
          <Card noPadding>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <Input
                  className="text-xl font-bold"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <label className="text-sm">Semanas:</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={editing.cycleWeeks}
                    onChange={(e) =>
                      setEditing({ ...editing, cycleWeeks: Number(e.target.value) || 1 })
                    }
                    className="w-16 px-2 py-1 rounded border"
                  />
                </div>
                <Button onClick={save}>
                  <Save size={16} /> Guardar
                </Button>
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cerrar
                </Button>
              </div>
              {/* Toolbar de relleno rápido */}
              <div className="rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/40 dark:bg-indigo-500/5 p-3 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-indigo-700 dark:text-indigo-300">
                    <Paintbrush size={16} /> Rellenado rápido
                  </div>
                  <span className="text-xs text-slate-500">
                    Elige una plantilla "pincel" y aplica con un click. También puedes copiar
                    semanas.
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                    Pincel:
                  </span>
                  {templates
                    .filter((t: any) => t.isActive)
                    .map((t: any) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setBrush(t.id)}
                        className={
                          'px-2.5 py-1 rounded-md text-xs font-bold border-2 transition ' +
                          (brush === t.id
                            ? 'ring-2 ring-indigo-300/50 border-indigo-500'
                            : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300')
                        }
                        style={{
                          background: brush === t.id ? t.color || '#6366F1' : 'transparent',
                          color: brush === t.id ? 'white' : undefined,
                        }}
                        title={`${t.name} · ${t.startTime}–${t.endTime}`}
                      >
                        {t.code}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => setBrush('')}
                    className={
                      'px-2.5 py-1 rounded-md text-xs font-bold border-2 transition ' +
                      (!brush
                        ? 'border-slate-500 bg-slate-200 dark:bg-slate-700'
                        : 'border-dashed border-slate-300 hover:border-slate-400')
                    }
                  >
                    Borrar
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applyPreset('lunVie')}
                  >
                    <Wand2 size={14} /> Lun-Vie con pincel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applyPreset('todos')}
                  >
                    <Wand2 size={14} /> Toda la semana
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => applyPreset('limpiar')}
                  >
                    <Eraser size={14} /> Vaciar todo
                  </Button>
                </div>
              </div>

              <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-xs border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="bg-slate-100 dark:bg-slate-800 border-b border-r border-slate-200 dark:border-slate-700 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 w-20">
                        Semana
                      </th>
                      {DAYS.map((d, i) => (
                        <th
                          key={d}
                          className={
                            'bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 ' +
                            (i < 6 ? 'border-r' : '') +
                            (i >= 5 ? ' bg-slate-200/60 dark:bg-slate-800/80' : '')
                          }
                        >
                          {d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: editing.cycleWeeks }).map((_, w) => (
                      <tr key={w} className={w % 2 ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}>
                        <td className="border-b border-r border-slate-200 dark:border-slate-700 px-2 py-2 text-center text-slate-700 dark:text-slate-200">
                          <div className="font-black mb-1">{w + 1}</div>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                brush
                                  ? fillRow(w, [1, 2, 3, 4, 5], brush)
                                  : toast.error('Elige pincel')
                              }
                              className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 font-bold"
                              title="Aplicar pincel a Lun-Vie de esta semana"
                            >
                              L-V
                            </button>
                            <button
                              type="button"
                              onClick={() => fillRow(w, [1, 2, 3, 4, 5, 6, 7], '')}
                              className="text-[10px] p-1 rounded text-slate-400 hover:text-rose-500"
                              title="Vaciar esta semana"
                            >
                              <Eraser size={11} />
                            </button>
                            {w > 0 && (
                              <button
                                type="button"
                                onClick={() => copyWeek(w - 1, w)}
                                className="text-[10px] p-1 rounded text-slate-400 hover:text-indigo-500"
                                title={`Copiar semana ${w} aquí`}
                              >
                                <Copy size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                        {Array.from({ length: 7 }).map((_, d) => {
                          const tplId = slotOf(w, d + 1);
                          const tpl: any = tplId
                            ? templates.find((t: any) => t.id === tplId)
                            : null;
                          const isWeekend = d >= 5;
                          return (
                            <td
                              key={d}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).tagName === 'SELECT') return;
                                if (!tplId && brush) setSlot(w, d + 1, brush);
                              }}
                              className={
                                'border-b border-slate-200 dark:border-slate-700 p-1.5 cursor-pointer ' +
                                (d < 6 ? 'border-r ' : '') +
                                (isWeekend ? 'bg-slate-100/60 dark:bg-slate-800/40' : '') +
                                (!tplId && brush
                                  ? ' hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                                  : '')
                              }
                            >
                              <select
                                value={tplId}
                                onChange={(e) => setSlot(w, d + 1, e.target.value)}
                                className="w-full text-xs px-2 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                                style={{
                                  background: tpl?.color ? tpl.color : undefined,
                                  color: tpl?.color ? 'white' : undefined,
                                  borderColor: tpl?.color || undefined,
                                }}
                              >
                                <option value="" style={{ background: 'white', color: '#64748b' }}>
                                  —
                                </option>
                                {templates
                                  .filter((t: any) => t.isActive)
                                  .map((t: any) => (
                                    <option
                                      key={t.id}
                                      value={t.id}
                                      style={{ background: 'white', color: '#0f172a' }}
                                    >
                                      {t.code} ({t.startTime}–{t.endTime})
                                    </option>
                                  ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          {editing.id && (
            <Card noPadding>
              <div className="p-6 space-y-3">
                <h3 className="font-bold">Empleados asignados</h3>
                <ul className="divide-y">
                  {assignments.map((a) => {
                    const e: any = employees.find((x) => x.id === a.employeeId);
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2">
                        <span className="flex-1">
                          {e ? `${e.firstName} ${e.lastName}` : a.employeeId}
                          <span className="text-xs text-slate-400 ml-2">
                            (offset {a.weekOffset} · desde {a.validFrom})
                          </span>
                        </span>
                        <button
                          onClick={() => removeAssignment(a)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <AssignmentForm
                  onAdd={addAssignment}
                  employees={employees}
                  cycleWeeks={editing.cycleWeeks}
                />
              </div>
            </Card>
          )}

          {editing.id && (
            <Card noPadding>
              <div className="p-6 space-y-3">
                <h3 className="font-bold flex items-center gap-2">
                  <Calendar size={16} /> Expandir patrón a fechas
                </h3>
                <div className="flex items-center gap-3">
                  <Input
                    label="Desde"
                    type="date"
                    value={expanding.from}
                    onChange={(e) => setExpanding({ ...expanding, from: e.target.value })}
                  />
                  <Input
                    label="Hasta"
                    type="date"
                    value={expanding.to}
                    onChange={(e) => setExpanding({ ...expanding, to: e.target.value })}
                  />
                  <div className="self-end">
                    <Button onClick={expand}>Expandir</Button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 italic">
                  Genera asignaciones materializadas (turnos reales) en el rango. Es idempotente:
                  borra antes las generadas previamente con este patrón en el mismo rango.
                </p>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

const AssignmentForm: React.FC<{
  onAdd: (employeeId: string, validFrom: string, weekOffset: number) => void;
  employees: any[];
  cycleWeeks: number;
}> = ({ onAdd, employees, cycleWeeks }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  return (
    <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto_auto] gap-3 items-end">
        <div className="min-w-0">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Empleado
          </label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
          >
            <option value="">— seleccionar —</option>
            {employees
              .filter((e) => e.status === 'active')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.firstName} {e.lastName}
                </option>
              ))}
          </select>
        </div>
        <Input
          label="Desde"
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
        />
        <div className="w-24">
          <Input
            label="Offset"
            type="number"
            min={0}
            max={cycleWeeks - 1}
            value={weekOffset}
            onChange={(e) => setWeekOffset(Number(e.target.value))}
          />
        </div>
        <Button
          onClick={() => {
            if (!employeeId || !validFrom) return;
            onAdd(employeeId, validFrom, weekOffset);
            setEmployeeId('');
            setValidFrom('');
            setWeekOffset(0);
          }}
        >
          <Plus size={16} /> Añadir
        </Button>
      </div>
    </div>
  );
};

export default ShiftPatterns;
