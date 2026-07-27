import { shiftPatternsApi, shiftTemplatesApi, employeesApi } from '../api';
import type {
  ShiftPattern as Pattern,
  ShiftPatternSlot as PatternSlot,
  ShiftPatternAssignment as Assignment,
  ShiftTemplate,
} from '../domain/shift';
import type { Employee } from '../domain/employee';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, useToast, NumberInput, SearchableSelect, Table } from '@openfactu/ui';
import type { TableColumn, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import {
  Repeat,
  Plus,
  Pencil,
  Save,
  Trash2,
  Calendar,
  Paintbrush,
  Copy,
  Eraser,
  Wand2,
} from 'lucide-react';
import { ApiError } from '@/shared/http';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const ShiftPatterns: React.FC = () => {
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const [list, setList] = useState<Pattern[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
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
      shiftPatternsApi.list(),
      shiftTemplatesApi.list(),
      employeesApi.list(),
    ]);
    setList(Array.isArray(p) ? p : []);
    setTemplates(Array.isArray(t) ? t : []);
    setEmployees(Array.isArray(e) ? e : []);
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const openEdit = async (p: Pattern) => {
    const r = await shiftPatternsApi.get(p.id);
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
    try {
      const d = isNew
        ? await shiftPatternsApi.create(editing)
        : await shiftPatternsApi.update(editing.id, editing);
      toast.success('Guardado');
      setEditing(d);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const addAssignment = async (employeeId: string, validFrom: string, weekOffset: number) => {
    if (!editing?.id) {
      toast.error('Guarda el patrón antes de asignar empleados');
      return;
    }
    try {
      await shiftPatternsApi.addAssignment(editing.id, { employeeId, validFrom, weekOffset });
      openEdit(editing);
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const removeAssignment = async (a: Assignment) => {
    await shiftPatternsApi.removeAssignment(editing!.id, a.id);
    if (editing) openEdit(editing);
  };

  const expand = async () => {
    if (!editing?.id) return;
    if (!expanding.from || !expanding.to) {
      toast.error('Indica from y to');
      return;
    }
    try {
      const d = await shiftPatternsApi.expand(editing.id, expanding);
      toast.success(`Generadas ${d.created} asignaciones de turno`);
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  // Listado de patrones. La matriz semana × día de más abajo NO usa la Table
  // del paquete: es una rejilla editable con un <select> por celda.
  const listColumns: TableColumn<Pattern>[] = [
    { header: 'Nombre', accessor: 'name', sortable: true, primary: true },
    { header: 'Semanas ciclo', accessor: 'cycleWeeks', sortable: true },
    {
      header: 'Activo',
      sortable: true,
      sortAccessor: (p) => (p.isActive ? 1 : 0),
      cell: (p) => (p.isActive ? 'Sí' : 'No'),
    },
  ];

  const listRowActions = (p: Pattern): RowAction[] => [
    {
      label: 'Editar',
      icon: <Pencil size={14} />,
      disabled: !canWrite,
      onClick: () => openEdit(p),
    },
  ];

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
        {canWrite && (
          <Button size="sm" onClick={newPattern}>
            <Plus size={14} /> Nuevo patrón
          </Button>
        )}
      </div>

      {!editing && (
        <Card className="overflow-hidden" noPadding>
          <Table
            columns={listColumns}
            data={list}
            rowActions={listRowActions}
            onRowClick={(p) => openEdit(p)}
            emptyMessage="Todavía no hay patrones de turno."
          />
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
                  {/* La etiqueta va en línea, no encima, así que se mantiene el
                      <label> suelto en lugar de la prop `label`. */}
                  <label className="text-sm">Semanas:</label>
                  <NumberInput
                    value={editing.cycleWeeks}
                    onChange={(v) => setEditing({ ...editing, cycleWeeks: v ?? 1 })}
                    min={1}
                    max={12}
                    inputSize="sm"
                    containerClassName="w-20"
                  />
                </div>
                <Button onClick={save} disabled={!canWrite}>
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
                  {/* Muestras de color: el relleno lo manda el color de la
                      plantilla, así que el `style` inline se conserva sobre el
                      Button. */}
                  {templates
                    .filter((t: any) => t.isActive)
                    .map((t: any) => (
                      <Button
                        key={t.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setBrush(t.id)}
                        className={
                          'px-2.5 py-1 rounded-md text-xs font-bold border-2 ' +
                          (brush === t.id
                            ? 'ring-2 ring-indigo-300/50 border-indigo-500'
                            : 'border-border-default hover:border-indigo-300')
                        }
                        style={{
                          background: brush === t.id ? t.color || '#6366F1' : 'transparent',
                          color: brush === t.id ? 'white' : undefined,
                        }}
                        title={`${t.name} · ${t.startTime}–${t.endTime}`}
                      >
                        {t.code}
                      </Button>
                    ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setBrush('')}
                    className={
                      'px-2.5 py-1 rounded-md text-xs font-bold border-2 ' +
                      (!brush
                        ? 'border-slate-500 bg-slate-200 dark:bg-slate-700'
                        : 'border-dashed border-slate-300 hover:border-slate-400')
                    }
                  >
                    Borrar
                  </Button>
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

              <div className="overflow-auto rounded-lg border border-border-default">
                <table className="w-full text-xs border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="bg-bg-muted border-b border-r border-border-default px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 w-20">
                        Semana
                      </th>
                      {DAYS.map((d, i) => (
                        <th
                          key={d}
                          className={
                            'bg-bg-muted border-b border-border-default px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 ' +
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
                      <tr key={w} className={w % 2 ? 'bg-bg-muted' : ''}>
                        <td className="border-b border-r border-border-default px-2 py-2 text-center text-fg-body">
                          <div className="font-black mb-1">{w + 1}</div>
                          <div className="flex items-center justify-center gap-1">
                            {/* Micro-acciones dentro de la matriz: se mantiene el
                                relleno reducido con className para no romper la
                                densidad de la cuadrícula. */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                brush
                                  ? fillRow(w, [1, 2, 3, 4, 5], brush)
                                  : toast.error('Elige pincel')
                              }
                              className="text-[10px] px-1.5 py-0.5 font-bold"
                              title="Aplicar pincel a Lun-Vie de esta semana"
                            >
                              L-V
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => fillRow(w, [1, 2, 3, 4, 5, 6, 7], '')}
                              className="text-[10px] p-1"
                              title="Vaciar esta semana"
                            >
                              <Eraser size={11} />
                            </Button>
                            {w > 0 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyWeek(w - 1, w)}
                                className="text-[10px] p-1"
                                title={`Copiar semana ${w} aquí`}
                              >
                                <Copy size={11} />
                              </Button>
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
                                'border-b border-border-default p-1.5 cursor-pointer ' +
                                (d < 6 ? 'border-r ' : '') +
                                (isWeekend ? 'bg-bg-muted' : '') +
                                (!tplId && brush
                                  ? ' hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                                  : '')
                              }
                            >
                              {/* Excepción deliberada: <select> nativo. La celda
                                  es una superficie de pintado y su `onClick`
                                  distingue el control por `tagName === 'SELECT'`;
                                  además el relleno del control y de cada opción
                                  es el color arbitrario de la plantilla, que
                                  `Select` no puede expresar (no acepta `style`). */}
                              <select
                                value={tplId}
                                onChange={(e) => setSlot(w, d + 1, e.target.value)}
                                className="w-full text-xs px-2 py-1.5 rounded-md border border-border-default bg-bg-card font-bold focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
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
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAssignment(a)}
                          disabled={!canDelete}
                          title="Quitar asignación"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <AssignmentForm
                  onAdd={addAssignment}
                  employees={employees}
                  cycleWeeks={editing.cycleWeeks}
                  canWrite={canWrite}
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
                    <Button onClick={expand} disabled={!canWrite}>
                      Expandir
                    </Button>
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
  canWrite: boolean;
}> = ({ onAdd, employees, cycleWeeks, canWrite }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  // `weekOffset` puede quedar vacío en el NumberInput → null; al añadir se
  // normaliza a 0.
  const [weekOffset, setWeekOffset] = useState<number | null>(0);
  const employeeOptions = useMemo(
    () =>
      employees
        .filter((e) => e.status === 'active')
        .map((e) => ({
          value: e.id,
          label: `${e.firstName} ${e.lastName}`,
          secondaryLabel: e.code,
        })),
    [employees],
  );
  return (
    <div className="pt-3 border-t border-border-default">
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto_auto] gap-3 items-end">
        <div className="min-w-0">
          {/* SearchableSelect no tiene prop `label` → se conserva el <label>
              suelto. */}
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Empleado
          </label>
          <SearchableSelect
            options={employeeOptions}
            value={employeeId}
            onChange={(v) => setEmployeeId(v)}
            placeholder="— seleccionar —"
          />
        </div>
        <Input
          label="Desde"
          type="date"
          value={validFrom}
          onChange={(e) => setValidFrom(e.target.value)}
        />
        <div className="w-24">
          <NumberInput
            label="Offset"
            value={weekOffset}
            onChange={(v) => setWeekOffset(v)}
            min={0}
            max={cycleWeeks - 1}
            emptyValue="zero"
          />
        </div>
        <Button
          disabled={!canWrite}
          onClick={() => {
            if (!employeeId || !validFrom) return;
            onAdd(employeeId, validFrom, weekOffset ?? 0);
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
