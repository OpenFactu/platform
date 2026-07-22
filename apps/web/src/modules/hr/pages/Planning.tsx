import { hrApi } from '../api';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Plus,
  X,
  Clock,
  Trash2,
  Pencil,
  Ban,
  Save,
  CopyPlus,
  AlertTriangle,
} from 'lucide-react';

interface ShiftAssignment {
  id: string;
  employeeId: string;
  date: string;
  startAt: string;
  endAt: string;
  status: 'scheduled' | 'cancelled' | 'substituted';
  shiftTemplateId: string | null;
  breakMinutes: number;
  notes: string | null;
}

const DAY_LABEL = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  const day = out.getDay() === 0 ? 7 : out.getDay();
  out.setDate(out.getDate() - (day - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeLabel(start: Date, days: number): string {
  const end = new Date(start);
  end.setDate(end.getDate() + days - 1);
  const fmt = (d: Date) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
}

function hoursOf(a: ShiftAssignment): number {
  const ms = new Date(a.endAt).getTime() - new Date(a.startAt).getTime();
  const h = ms / 3_600_000 - (a.breakMinutes || 0) / 60;
  return Math.max(0, h);
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_TINT: Record<string, string> = {
  scheduled: '',
  cancelled: 'opacity-40 line-through',
  substituted: 'opacity-70 italic',
};

interface ShiftFormState {
  shiftTemplateId: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  notes: string;
  // 2º tramo opcional (sólo en modo crear con plantilla partida o cuando el
  // usuario activa "añadir 2º tramo" manualmente).
  secondEnabled: boolean;
  secondStartAt: string;
  secondEndAt: string;
}

const EMPTY_FORM: ShiftFormState = {
  shiftTemplateId: '',
  startAt: '',
  endAt: '',
  breakMinutes: 0,
  notes: '',
  secondEnabled: false,
  secondStartAt: '',
  secondEndAt: '',
};

export const Planning: React.FC = () => {
  const { token, user } = useAuth();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [employees, setEmployees] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [assigns, setAssigns] = useState<ShiftAssignment[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incidentTypes, setIncidentTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal state: 'create' opens with employeeId+date; 'edit' opens with existing assignment id.
  const [modal, setModal] = useState<
    | { kind: 'create'; employeeId: string; date: string }
    | { kind: 'edit'; id: string; employeeId: string; date: string }
    | null
  >(null);
  const [form, setForm] = useState<ShiftFormState>(EMPTY_FORM);

  const toast = useToast();
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'x-tenant-id': user?.tenantId || '' }),
    [token, user?.tenantId],
  );

  const days = view === 'week' ? 7 : 35;
  const rangeStart = view === 'week' ? cursor : startOfWeek(cursor);
  const rangeEnd = useMemo(() => {
    const e = new Date(rangeStart);
    e.setDate(e.getDate() + days - 1);
    return e;
  }, [rangeStart, days]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const from = ymd(rangeStart);
      const to = ymd(rangeEnd);
      const [e, t, a, inc, it] = await Promise.all([
        hrApi.get<any>('/api/hr/employees'),
        hrApi.get<any>('/api/hr/shift-templates'),
        hrApi.get<any>(`/api/hr/shift-assignments?from=${from}&to=${to}`),
        hrApi.get<any>('/api/hr/incidents').catch(() => []),
        hrApi.get<any>('/api/hr/incident-types').catch(() => []),
      ]);
      setEmployees(Array.isArray(e) ? e : []);
      setTemplates(Array.isArray(t) ? t : []);
      setAssigns(Array.isArray(a) ? a : []);
      setIncidents(Array.isArray(inc) ? inc : []);
      setIncidentTypes(Array.isArray(it) ? it : []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId, rangeStart.getTime(), days]);

  const tplMap = useMemo(() => Object.fromEntries(templates.map((t) => [t.id, t])), [templates]);
  const itMap = useMemo(
    () => Object.fromEntries(incidentTypes.map((t) => [t.id, t])),
    [incidentTypes],
  );

  // Mapa empleado → fecha → lista de incidencias (solo aprobadas/pendientes/cubiertas).
  const incidentsByDay = useMemo(() => {
    const m: Record<string, Record<string, any[]>> = {};
    for (const inc of incidents) {
      if (inc.status === 'rejected') continue;
      const start = new Date(inc.startAt);
      const end = inc.endAt ? new Date(inc.endAt) : start;
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      const last = new Date(end);
      last.setHours(0, 0, 0, 0);
      while (cur <= last) {
        const key = ymd(cur);
        m[inc.employeeId] = m[inc.employeeId] || {};
        m[inc.employeeId][key] = m[inc.employeeId][key] || [];
        m[inc.employeeId][key].push(inc);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return m;
  }, [incidents]);

  const grid = useMemo(() => {
    const m: Record<string, Record<string, ShiftAssignment[]>> = {};
    for (const a of assigns) {
      m[a.employeeId] = m[a.employeeId] || {};
      m[a.employeeId][a.date] = m[a.employeeId][a.date] || [];
      m[a.employeeId][a.date].push(a);
    }
    for (const empId of Object.keys(m)) {
      for (const d of Object.keys(m[empId])) {
        m[empId][d].sort((a, b) => a.startAt.localeCompare(b.startAt));
      }
    }
    return m;
  }, [assigns]);

  const totalsByEmp = useMemo(() => {
    const out: Record<string, { hours: number; shifts: number }> = {};
    for (const a of assigns) {
      if (a.status === 'cancelled') continue;
      const cur = out[a.employeeId] || { hours: 0, shifts: 0 };
      cur.hours += hoursOf(a);
      cur.shifts += 1;
      out[a.employeeId] = cur;
    }
    return out;
  }, [assigns]);

  const todayStr = ymd(new Date());

  const openCreate = (employeeId: string, date: string, suggestedStart?: string) => {
    const firstTpl = templates.find((t: any) => t.isActive) as any;
    const start =
      suggestedStart || (firstTpl ? `${date}T${firstTpl.startTime}:00` : `${date}T08:00:00`);
    const end = firstTpl ? `${date}T${firstTpl.endTime}:00` : `${date}T15:00:00`;
    const hasSplit = !!(firstTpl?.secondStartTime && firstTpl?.secondEndTime);
    setModal({ kind: 'create', employeeId, date });
    setForm({
      shiftTemplateId: firstTpl?.id || '',
      startAt: start,
      endAt: end,
      breakMinutes: firstTpl?.breakMinutes || 0,
      notes: '',
      secondEnabled: hasSplit,
      secondStartAt: hasSplit ? `${date}T${firstTpl.secondStartTime}:00` : '',
      secondEndAt: hasSplit ? `${date}T${firstTpl.secondEndTime}:00` : '',
    });
  };

  const openEdit = (a: ShiftAssignment) => {
    setModal({ kind: 'edit', id: a.id, employeeId: a.employeeId, date: a.date });
    setForm({
      shiftTemplateId: a.shiftTemplateId || '',
      startAt: a.startAt.slice(0, 19),
      endAt: a.endAt.slice(0, 19),
      breakMinutes: a.breakMinutes || 0,
      notes: a.notes || '',
      // Editar nunca toca el otro tramo: cada turno es una fila independiente.
      secondEnabled: false,
      secondStartAt: '',
      secondEndAt: '',
    });
  };

  const onPickTemplate = (tplId: string) => {
    const tpl: any = tplMap[tplId];
    if (!tpl || !modal) {
      setForm((f) => ({ ...f, shiftTemplateId: tplId }));
      return;
    }
    const hasSplit = !!(tpl.secondStartTime && tpl.secondEndTime);
    setForm((f) => ({
      ...f,
      shiftTemplateId: tplId,
      startAt: `${modal.date}T${tpl.startTime}:00`,
      endAt: `${modal.date}T${tpl.endTime}:00`,
      breakMinutes: tpl.breakMinutes || 0,
      secondEnabled: modal.kind === 'create' ? hasSplit : f.secondEnabled,
      secondStartAt: hasSplit ? `${modal.date}T${tpl.secondStartTime}:00` : '',
      secondEndAt: hasSplit ? `${modal.date}T${tpl.secondEndTime}:00` : '',
    }));
  };

  const submitForm = async () => {
    if (!modal) return;
    if (!form.startAt || !form.endAt) {
      toast.error('Indica hora inicio y fin');
      return;
    }
    if (new Date(form.endAt) <= new Date(form.startAt)) {
      toast.error('La hora fin debe ser posterior a la hora inicio');
      return;
    }
    const body = {
      employeeId: modal.employeeId,
      date: modal.date,
      startAt: form.startAt,
      endAt: form.endAt,
      breakMinutes: form.breakMinutes,
      shiftTemplateId: form.shiftTemplateId || null,
      notes: form.notes || null,
    };
    const url =
      modal.kind === 'edit' ? `/api/hr/shift-assignments/${modal.id}` : '/api/hr/shift-assignments';
    const r = await hrApi.raw(modal.kind === 'edit' ? 'PATCH' : 'POST', url, body);
    if (!r.ok) {
      const d = (r.data ?? {});
      toast.error(d.error || 'Error');
      return;
    }
    // Si el usuario marcó "tramo 2" en creación, generamos un segundo turno
    // independiente con las horas que él haya tecleado.
    if (modal.kind === 'create' && form.secondEnabled && form.secondStartAt && form.secondEndAt) {
      if (new Date(form.secondEndAt) <= new Date(form.secondStartAt)) {
        toast.error('El 2º tramo: la hora fin debe ser posterior al inicio');
        return;
      }
      await hrApi.raw('POST', '/api/hr/shift-assignments', {
          employeeId: modal.employeeId,
          date: modal.date,
          startAt: form.secondStartAt,
          endAt: form.secondEndAt,
          breakMinutes: 0,
          shiftTemplateId: form.shiftTemplateId || null,
          notes: form.notes || null,
        });
    }
    toast.success(modal.kind === 'edit' ? 'Turno actualizado' : 'Turno creado');
    setModal(null);
    fetchAll();
  };

  const cancelAssign = async () => {
    if (!modal || modal.kind !== 'edit') return;
    if (!confirm('¿Cancelar este turno? (queda en histórico tachado)')) return;
    await hrApi.raw('PATCH', `/api/hr/shift-assignments/${modal.id}`, { status: 'cancelled' });
    setModal(null);
    fetchAll();
  };

  const removeAssign = async () => {
    if (!modal || modal.kind !== 'edit') return;
    if (!confirm('¿Borrar este turno definitivamente?')) return;
    await hrApi.raw('DELETE', `/api/hr/shift-assignments/${modal.id}`);
    setModal(null);
    fetchAll();
  };

  const navigate = (dir: -1 | 1) => {
    const next = new Date(cursor);
    next.setDate(next.getDate() + dir * (view === 'week' ? 7 : 28));
    setCursor(view === 'week' ? startOfWeek(next) : startOfWeek(next));
  };
  const goToday = () => setCursor(startOfWeek(new Date()));

  const activeEmployees = employees.filter((e: any) => e.status === 'active');

  // Sugiere hora de comienzo para "añadir segundo turno": tras el último que termina.
  const suggestSplitStart = (list: ShiftAssignment[], date: string): string | undefined => {
    const last = [...list]
      .filter((a) => a.status !== 'cancelled')
      .sort((a, b) => b.endAt.localeCompare(a.endAt))[0];
    if (!last) return undefined;
    const end = new Date(last.endAt);
    end.setHours(end.getHours() + 1);
    if (ymd(end) !== date) return `${date}T16:00:00`;
    const hh = String(end.getHours()).padStart(2, '0');
    const mm = String(end.getMinutes()).padStart(2, '0');
    return `${date}T${hh}:${mm}:00`;
  };

  const grandTotal = Object.values(totalsByEmp).reduce((s, v) => s + v.hours, 0);

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black flex items-center gap-3">
            <CalendarDays className="text-emerald-600" size={32} /> Planificación
          </h1>
          <p className="text-slate-500 text-sm">
            {rangeLabel(rangeStart, days)} ·{' '}
            {assigns.filter((a) => a.status !== 'cancelled').length} turnos ·{' '}
            {grandTotal.toFixed(1)} h planificadas
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setView('week')}
              className={
                'px-3 py-1.5 text-sm font-medium transition ' +
                (view === 'week'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800')
              }
            >
              Semana
            </button>
            <button
              onClick={() => setView('month')}
              className={
                'px-3 py-1.5 text-sm font-medium transition ' +
                (view === 'month'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800')
              }
            >
              Mes (5 sem)
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={goToday}>
            <CalendarCheck size={14} /> Hoy
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(1)}>
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto" noPadding>
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-900 border-b border-r border-slate-200 dark:border-slate-700 p-3 text-left min-w-[200px]">
                Empleado
              </th>
              {Array.from({ length: days }).map((_, i) => {
                const d = new Date(rangeStart);
                d.setDate(d.getDate() + i);
                const dow = (d.getDay() + 6) % 7;
                const isWeekend = dow >= 5;
                const isToday = ymd(d) === todayStr;
                return (
                  <th
                    key={i}
                    className={
                      'border-b border-slate-200 dark:border-slate-700 p-2 text-center font-medium ' +
                      (isToday
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 '
                        : isWeekend
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 '
                          : 'bg-slate-50 dark:bg-slate-900 ')
                    }
                    style={{ minWidth: view === 'week' ? 180 : 120 }}
                  >
                    <div className="text-[10px] uppercase tracking-wider">{DAY_LABEL[dow]}</div>
                    <div className="text-lg font-black">{d.getDate()}</div>
                  </th>
                );
              })}
              <th className="sticky right-0 z-20 border-b border-l border-slate-200 dark:border-slate-700 p-3 text-right bg-slate-50 dark:bg-slate-900 min-w-[120px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {activeEmployees.length === 0 && (
              <tr>
                <td colSpan={days + 2} className="p-12 text-center text-slate-400 italic">
                  No hay empleados activos.
                </td>
              </tr>
            )}
            {activeEmployees.map((e: any) => {
              const tot = totalsByEmp[e.id] || { hours: 0, shifts: 0 };
              const contracted = Number(e.contractHours || 0);
              return (
                <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 border-b border-r border-slate-100 dark:border-slate-800 p-3">
                    <div className="font-bold text-slate-800 dark:text-slate-100">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="text-[10px] text-slate-400">{e.code}</div>
                  </td>
                  {Array.from({ length: days }).map((_, i) => {
                    const d = new Date(rangeStart);
                    d.setDate(d.getDate() + i);
                    const dateStr = ymd(d);
                    const list = grid[e.id]?.[dateStr] || [];
                    const dayIncidents = incidentsByDay[e.id]?.[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const dayHours = list
                      .filter((a) => a.status !== 'cancelled')
                      .reduce((s, a) => s + hoursOf(a), 0);
                    const isSplit = list.filter((a) => a.status !== 'cancelled').length > 1;
                    const blockingIncident = dayIncidents.find((inc) => {
                      const t: any = itMap[inc.incidentTypeId];
                      return (
                        inc.status !== 'rejected' && (t?.affectsPayroll || t?.requiresSubstitution)
                      );
                    });
                    return (
                      <td
                        key={i}
                        onClick={(ev) => {
                          if ((ev.target as HTMLElement).closest('[data-shift-card]')) return;
                          if ((ev.target as HTMLElement).closest('[data-add-split]')) return;
                          openCreate(
                            e.id,
                            dateStr,
                            list.length ? suggestSplitStart(list, dateStr) : undefined,
                          );
                        }}
                        className={
                          'border-b border-slate-100 dark:border-slate-800 p-1.5 align-top relative group cursor-pointer transition ' +
                          (blockingIncident
                            ? 'bg-amber-50/40 dark:bg-amber-500/5 '
                            : isToday
                              ? 'bg-emerald-50/30 dark:bg-emerald-500/5 '
                              : '') +
                          (!list.length ? 'hover:bg-indigo-50/40 dark:hover:bg-indigo-500/5' : '')
                        }
                      >
                        <div className="space-y-1 min-h-[58px]">
                          {/* Banderas de incidencias del día (color del tipo). */}
                          {dayIncidents.map((inc: any) => {
                            const it: any = itMap[inc.incidentTypeId];
                            const color = it?.color || '#f59e0b';
                            const overlapsShift = list.some((a) => {
                              const aS = new Date(a.startAt);
                              const aE = new Date(a.endAt);
                              const iS = new Date(inc.startAt);
                              const iE = inc.endAt ? new Date(inc.endAt) : aE;
                              return aS < iE && iS < aE;
                            });
                            return (
                              <div
                                key={inc.id}
                                title={`${it?.name || 'Incidencia'} · ${inc.status}${inc.notes ? `\n${inc.notes}` : ''}${overlapsShift && it?.requiresSubstitution ? '\n⚠ Solapa con turno y requiere sustituto' : ''}`}
                                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold shadow-sm border-l-4 cursor-help"
                                style={{
                                  borderLeftColor: color,
                                  background: `${color}22`,
                                  color: color,
                                }}
                              >
                                <AlertTriangle size={10} />
                                <span className="truncate flex-1">
                                  {it?.code || it?.name || 'Incidencia'}
                                </span>
                                {it?.requiresSubstitution && overlapsShift && (
                                  <span title="Requiere sustituto">⚑</span>
                                )}
                              </div>
                            );
                          })}
                          {list.map((a) => {
                            const tpl: any = a.shiftTemplateId ? tplMap[a.shiftTemplateId] : null;
                            const bg = tpl?.color || '#6366F1';
                            return (
                              <div
                                key={a.id}
                                data-shift-card
                                onClick={() => openEdit(a)}
                                title={`${tpl?.name || 'Turno'}\n${timeOf(a.startAt)} – ${timeOf(a.endAt)}\n${hoursOf(a).toFixed(2)} h${a.breakMinutes ? ` (pausa ${a.breakMinutes}m)` : ''}${a.notes ? `\n${a.notes}` : ''}\n\nClick: editar`}
                                className={
                                  'cursor-pointer rounded-lg px-2 py-1.5 text-white text-[11px] font-bold leading-tight shadow-sm hover:ring-2 hover:ring-white/30 transition ' +
                                  STATUS_TINT[a.status]
                                }
                                style={{
                                  background: `linear-gradient(135deg, ${bg}, ${bg}cc)`,
                                }}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <div className="flex items-center gap-1 truncate">
                                    <Clock size={10} className="opacity-80" />
                                    <span className="tabular-nums">
                                      {timeOf(a.startAt)}–{timeOf(a.endAt)}
                                    </span>
                                  </div>
                                  <span className="tabular-nums opacity-80 text-[10px]">
                                    {hoursOf(a).toFixed(1)}h
                                  </span>
                                </div>
                                {tpl?.code && (
                                  <div className="text-[9px] uppercase tracking-wider opacity-70 truncate mt-0.5">
                                    {tpl.code}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Acción contextual: vacío → "+ añadir" suave / con turno → "+ partido" en hover. */}
                        {!list.length ? (
                          <div className="mt-1 h-5 flex items-center justify-center text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition">
                            <Plus size={14} />
                          </div>
                        ) : (
                          <button
                            data-add-split
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openCreate(e.id, dateStr, suggestSplitStart(list, dateStr));
                            }}
                            className="mt-1 w-full h-5 rounded text-[10px] font-semibold flex items-center justify-center gap-1 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 opacity-0 group-hover:opacity-100 transition"
                            title="Añadir 2º turno (partido)"
                          >
                            <CopyPlus size={11} /> partido
                          </button>
                        )}
                        {isSplit && (
                          <div className="absolute top-0.5 right-1 text-[8px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-black">
                            {dayHours.toFixed(1)}h
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-white dark:bg-slate-900 border-b border-l border-slate-100 dark:border-slate-800 p-3 text-right">
                    <div className="font-black text-slate-800 dark:text-slate-100 tabular-nums text-lg">
                      {tot.hours.toFixed(1)}
                      <span className="text-xs text-slate-400 ml-1">h</span>
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      {tot.shifts} turno{tot.shifts === 1 ? '' : 's'}
                    </div>
                    {contracted > 0 && (
                      <div
                        className={
                          'text-[10px] tabular-nums font-bold ' +
                          (tot.hours > contracted
                            ? 'text-rose-600 dark:text-rose-400'
                            : tot.hours < contracted
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400')
                        }
                      >
                        {tot.hours > contracted ? '+' : ''}
                        {(tot.hours - contracted).toFixed(1)}h vs {contracted}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-3 text-xs text-slate-500 space-y-1.5">
        {loading && <div>Cargando…</div>}
        <div>
          <b className="text-slate-700 dark:text-slate-300">Cómo funciona:</b> click en celda vacía
          → crear turno. Click en un turno → editar / cancelar / borrar. Hover una celda con turno →
          "+ partido" para añadir 2º tramo (turno partido).
        </div>
        <div className="flex flex-wrap gap-3 items-center pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-500/30" />
            Hoy
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border-l-4 border-amber-500 bg-amber-100 dark:bg-amber-500/20" />
            Incidencia (afecta nómina o requiere sustituto)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CopyPlus size={12} className="text-amber-600" /> Turno partido
          </span>
          <span className="inline-flex items-center gap-1.5">
            ⚑ <span>Solapa turno y requiere sustituto → flujo en Incidencias</span>
          </span>
        </div>
      </div>

      {/* Modal crear / editar */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-w-lg w-full" noPadding>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    {modal.kind === 'edit' ? <Pencil size={18} /> : <Plus size={18} />}
                    {modal.kind === 'edit' ? 'Editar turno' : 'Nuevo turno'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {employees.find((e) => e.id === modal.employeeId)?.firstName}{' '}
                    {employees.find((e) => e.id === modal.employeeId)?.lastName} ·{' '}
                    {new Date(modal.date).toLocaleDateString('es-ES', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </p>
                </div>
                <button onClick={() => setModal(null)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">
                  Plantilla
                </label>
                <div className="flex flex-wrap gap-2">
                  {templates
                    .filter((t: any) => t.isActive)
                    .map((t: any) => (
                      <button
                        key={t.id}
                        onClick={() => onPickTemplate(t.id)}
                        className={
                          'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition ' +
                          (form.shiftTemplateId === t.id
                            ? 'border-indigo-500 ring-2 ring-indigo-300/50'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300')
                        }
                        style={{
                          background:
                            form.shiftTemplateId === t.id ? t.color || '#6366F1' : 'transparent',
                          color: form.shiftTemplateId === t.id ? 'white' : undefined,
                        }}
                      >
                        {t.code} · {t.startTime}–{t.endTime}
                      </button>
                    ))}
                  <button
                    onClick={() => setForm((f) => ({ ...f, shiftTemplateId: '' }))}
                    className={
                      'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition ' +
                      (!form.shiftTemplateId
                        ? 'border-slate-500 bg-slate-100 dark:bg-slate-700'
                        : 'border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400')
                    }
                  >
                    Personalizado
                  </button>
                  {templates.length === 0 && (
                    <p className="text-xs text-slate-400 italic">
                      No hay plantillas. Crea una en Plantillas de turno.
                    </p>
                  )}
                </div>
                {modal.kind === 'edit' &&
                  (() => {
                    const tpl: any = form.shiftTemplateId ? tplMap[form.shiftTemplateId] : null;
                    if (!tpl?.secondStartTime || !tpl?.secondEndTime) return null;
                    return (
                      <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <CopyPlus size={14} /> Estás editando un <b>único tramo</b>. El otro tramo
                        es un turno aparte: ciérralo y haz click sobre él en la planificación.
                      </div>
                    );
                  })()}
              </div>

              {/* Tramo 1 */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px] font-black">
                    ①
                  </span>
                  Tramo {modal.kind === 'create' && form.secondEnabled ? '1 (mañana)' : ''}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Inicio"
                    type="datetime-local"
                    value={form.startAt.slice(0, 16)}
                    onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                  />
                  <Input
                    label="Fin"
                    type="datetime-local"
                    value={form.endAt.slice(0, 16)}
                    onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                  />
                </div>
              </div>

              {/* Tramo 2 (sólo en creación) */}
              {modal.kind === 'create' && (
                <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-500/5 p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.secondEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const date = modal.date;
                        const tpl: any = form.shiftTemplateId ? tplMap[form.shiftTemplateId] : null;
                        const defS = tpl?.secondStartTime || form.endAt.slice(11, 16) || '16:00';
                        const defE = tpl?.secondEndTime || '20:00';
                        setForm((f) => ({
                          ...f,
                          secondEnabled: checked,
                          secondStartAt: checked ? `${date}T${defS}:00` : '',
                          secondEndAt: checked ? `${date}T${defE}:00` : '',
                        }));
                      }}
                    />
                    <CopyPlus size={14} className="text-amber-600" />
                    <span className="text-sm font-bold">Turno partido (2º tramo)</span>
                  </label>
                  {form.secondEnabled && (
                    <>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-2 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">
                          ②
                        </span>
                        Tramo 2 (tarde)
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Inicio 2º"
                          type="datetime-local"
                          value={form.secondStartAt.slice(0, 16)}
                          onChange={(e) => setForm({ ...form, secondStartAt: e.target.value })}
                        />
                        <Input
                          label="Fin 2º"
                          type="datetime-local"
                          value={form.secondEndAt.slice(0, 16)}
                          onChange={(e) => setForm({ ...form, secondEndAt: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Pausa (min)"
                  type="number"
                  min={0}
                  value={form.breakMinutes}
                  onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) || 0 })}
                />
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">
                    Horas netas
                  </label>
                  {(() => {
                    const split = modal.kind === 'create' && form.secondEnabled;
                    const h1 =
                      form.startAt && form.endAt
                        ? Math.max(
                            0,
                            (new Date(form.endAt).getTime() - new Date(form.startAt).getTime()) /
                              3_600_000 -
                              (form.breakMinutes || 0) / 60,
                          )
                        : 0;
                    let h2 = 0;
                    if (split && form.secondStartAt && form.secondEndAt) {
                      h2 = Math.max(
                        0,
                        (new Date(form.secondEndAt).getTime() -
                          new Date(form.secondStartAt).getTime()) /
                          3_600_000,
                      );
                    }
                    const total = h1 + h2;
                    return (
                      <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800">
                        <div className="text-lg font-black tabular-nums">{total.toFixed(2)} h</div>
                        {split && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold tabular-nums mt-0.5">
                            ① {h1.toFixed(2)}h + ② {h2.toFixed(2)}h
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-2">
                  <Input
                    label="Notas"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  {modal.kind === 'edit' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={cancelAssign}>
                        <Ban size={14} /> Cancelar turno
                      </Button>
                      <Button size="sm" variant="danger" onClick={removeAssign}>
                        <Trash2 size={14} /> Borrar
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setModal(null)}>
                    Cerrar
                  </Button>
                  <Button size="sm" onClick={submitForm}>
                    <Save size={14} /> {modal.kind === 'edit' ? 'Guardar' : 'Crear'}
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

export default Planning;
