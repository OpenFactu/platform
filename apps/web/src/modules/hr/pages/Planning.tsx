import {
  shiftAssignmentsApi,
  employeesApi,
  shiftTemplatesApi,
  incidentsApi,
  incidentTypesApi,
} from '../api';
import type { ShiftAssignment, ShiftTemplate } from '../domain/shift';
import type { Employee } from '../domain/employee';
import type { Incident, IncidentType } from '../domain/incident';
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, useToast, PageHeader, Tabs, Checkbox, Modal } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CalendarCheck,
  Plus,
  Clock,
  Trash2,
  Pencil,
  Ban,
  Save,
  CopyPlus,
  AlertTriangle,
} from 'lucide-react';
import { ApiError } from '@/shared/http';
import { useI18n } from '@/i18n/I18nContext';
import { formatDate, formatTime } from '@/i18n/format';

// Claves de i18n (lunes primero); se traducen al pintar.
const DAY_LABEL = [
  'hrTime.days.mon',
  'hrTime.days.tue',
  'hrTime.days.wed',
  'hrTime.days.thu',
  'hrTime.days.fri',
  'hrTime.days.sat',
  'hrTime.days.sun',
];

// Amplitud del calendario. Lo que cambia es la vista completa, no un filtro.
const VIEW_TABS = [
  { key: 'week', label: 'hrTime.planning.viewWeek' },
  { key: 'month', label: 'hrTime.planning.viewMonth' },
];

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
  const fmt = (d: Date) => formatDate(d, { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)} ${end.getFullYear()}`;
}

function hoursOf(a: ShiftAssignment): number {
  const ms = new Date(a.endAt).getTime() - new Date(a.startAt).getTime();
  const h = ms / 3_600_000 - (a.breakMinutes || 0) / 60;
  return Math.max(0, h);
}

function timeOf(iso: string): string {
  return formatTime(iso, { hour: '2-digit', minute: '2-digit' });
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
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const [view, setView] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState(() => startOfWeek(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [assigns, setAssigns] = useState<ShiftAssignment[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentTypes, setIncidentTypes] = useState<IncidentType[]>([]);
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
        employeesApi.list(),
        shiftTemplatesApi.list(),
        shiftAssignmentsApi.list(from, to),
        incidentsApi.list().catch(() => []),
        incidentTypesApi.list().catch(() => []),
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
      toast.error(t('hrTime.planning.timesRequired'));
      return;
    }
    if (new Date(form.endAt) <= new Date(form.startAt)) {
      toast.error(t('hrTime.planning.endAfterStart'));
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
    try {
      if (modal.kind === 'edit') {
        await shiftAssignmentsApi.update(modal.id, body);
      } else {
        await shiftAssignmentsApi.create(body);
      }
      // Si el usuario marcó "tramo 2" en creación, generamos un segundo turno
      // independiente con las horas que él haya tecleado.
      if (modal.kind === 'create' && form.secondEnabled && form.secondStartAt && form.secondEndAt) {
        if (new Date(form.secondEndAt) <= new Date(form.secondStartAt)) {
          toast.error(t('hrTime.planning.secondEndAfterStart'));
          return;
        }
        await shiftAssignmentsApi.create({
          employeeId: modal.employeeId,
          date: modal.date,
          startAt: form.secondStartAt,
          endAt: form.secondEndAt,
          breakMinutes: 0,
          shiftTemplateId: form.shiftTemplateId || null,
          notes: form.notes || null,
        });
      }
      toast.success(
        modal.kind === 'edit' ? t('hrTime.planning.updated') : t('hrTime.planning.created'),
      );
      setModal(null);
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : t('hr.common.error'),
      );
    }
  };

  const cancelAssign = async () => {
    if (!modal || modal.kind !== 'edit') return;
    if (!confirm(t('hrTime.planning.confirmCancel'))) return;
    await shiftAssignmentsApi.update(modal.id, { status: 'cancelled' });
    setModal(null);
    fetchAll();
  };

  const removeAssign = async () => {
    if (!modal || modal.kind !== 'edit') return;
    if (!confirm(t('hrTime.planning.confirmDelete'))) return;
    await shiftAssignmentsApi.remove(modal.id);
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
      <PageHeader
        title={t('hrTime.planning.title')}
        subtitle={
          <>
            {rangeLabel(rangeStart, days)} ·{' '}
            {t('hrTime.planning.shiftsCount', {
              count: assigns.filter((a) => a.status !== 'cancelled').length,
            })}{' '}
            · {t('hrTime.planning.plannedHours', { hours: grandTotal.toFixed(1) })}
          </>
        }
        icon={<CalendarDays size={18} />}
        size="lg"
        actions={
          // El selector de vista y la navegación del rango van juntos a la
          // derecha: no son pestañas de la página, sino controles del calendario.
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs
              items={VIEW_TABS.map((x) => ({ ...x, label: t(x.label) }))}
              value={view}
              onChange={(k) => setView(k as 'week' | 'month')}
              variant="segmented"
              size="sm"
            />
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft size={16} />
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={goToday}>
              <CalendarCheck size={14} /> {t('hrTime.planning.today')}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate(1)}>
              <ChevronRight size={16} />
            </Button>
          </div>
        }
      />

      <Card className="overflow-x-auto" noPadding>
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-bg-muted border-b border-r border-border-default p-3 text-left min-w-[200px]">
                {t('hr.common.employee')}
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
                      'border-b border-border-default p-2 text-center font-medium ' +
                      (isToday
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 '
                        : isWeekend
                          ? 'bg-bg-muted text-slate-500 '
                          : 'bg-bg-muted ')
                    }
                    style={{ minWidth: view === 'week' ? 180 : 120 }}
                  >
                    <div className="text-[10px] uppercase tracking-wider">{t(DAY_LABEL[dow])}</div>
                    <div className="text-lg font-black">{d.getDate()}</div>
                  </th>
                );
              })}
              <th className="sticky right-0 z-20 border-b border-l border-border-default p-3 text-right bg-bg-muted min-w-[120px]">
                {t('hr.common.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {activeEmployees.length === 0 && (
              <tr>
                <td colSpan={days + 2} className="p-12 text-center text-slate-400 italic">
                  {t('hrTime.planning.noActiveEmployees')}
                </td>
              </tr>
            )}
            {activeEmployees.map((e: any) => {
              const tot = totalsByEmp[e.id] || { hours: 0, shifts: 0 };
              const contracted = Number(e.contractHours || 0);
              return (
                <tr key={e.id} className="hover:bg-bg-hover">
                  <td className="sticky left-0 z-10 bg-bg-card border-b border-r border-border-subtle p-3">
                    <div className="font-bold text-fg-default">
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
                          if (!canWrite) return;
                          openCreate(
                            e.id,
                            dateStr,
                            list.length ? suggestSplitStart(list, dateStr) : undefined,
                          );
                        }}
                        className={
                          'border-b border-border-subtle p-1.5 align-top relative group cursor-pointer transition ' +
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
                                title={`${it?.name || t('hrTime.planning.incident')} · ${t(`hr.incidentStatus.${inc.status}`)}${inc.notes ? `\n${inc.notes}` : ''}${overlapsShift && it?.requiresSubstitution ? `\n⚠ ${t('hrTime.planning.overlapsNeedsSub')}` : ''}`}
                                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-bold shadow-sm border-l-4 cursor-help"
                                style={{
                                  borderLeftColor: color,
                                  background: `${color}22`,
                                  color: color,
                                }}
                              >
                                <AlertTriangle size={10} />
                                <span className="truncate flex-1">
                                  {it?.code || it?.name || t('hrTime.planning.incident')}
                                </span>
                                {it?.requiresSubstitution && overlapsShift && (
                                  <span title={t('hrTime.planning.needsSub')}>⚑</span>
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
                                title={`${tpl?.name || t('hrTime.planning.shift')}\n${timeOf(a.startAt)} – ${timeOf(a.endAt)}\n${hoursOf(a).toFixed(2)} h${a.breakMinutes ? ` ${t('hrTime.planning.breakShort', { n: a.breakMinutes })}` : ''}${a.notes ? `\n${a.notes}` : ''}\n\n${t('hrTime.planning.clickToEdit')}`}
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
                        {canWrite &&
                          (!list.length ? (
                            <div className="mt-1 h-5 flex items-center justify-center text-fg-subtle opacity-0 group-hover:opacity-100 transition">
                              <Plus size={14} />
                            </div>
                          ) : (
                            // Excepción deliberada: no es un control, es la zona
                            // de acción de la celda del calendario (ocupa el ancho
                            // completo, se revela en hover y el `onClick` del <td>
                            // la localiza con `closest('[data-add-split]')`).
                            <button
                              data-add-split
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openCreate(e.id, dateStr, suggestSplitStart(list, dateStr));
                              }}
                              className="mt-1 w-full h-5 rounded text-[10px] font-semibold flex items-center justify-center gap-1 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 opacity-0 group-hover:opacity-100 transition"
                              title={t('hrTime.planning.addSplitTitle')}
                            >
                              <CopyPlus size={11} /> {t('hrTime.planning.split')}
                            </button>
                          ))}
                        {isSplit && (
                          <div className="absolute top-0.5 right-1 text-[8px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-black">
                            {dayHours.toFixed(1)}h
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-bg-card border-b border-l border-border-subtle p-3 text-right">
                    <div className="font-black text-fg-default tabular-nums text-lg">
                      {tot.hours.toFixed(1)}
                      <span className="text-xs text-slate-400 ml-1">h</span>
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      {t('hrTime.planning.shiftsCount', { count: tot.shifts })}
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

      <div className="rounded-lg border border-border-default bg-bg-muted p-3 text-xs text-slate-500 space-y-1.5">
        {loading && <div>{t('hr.common.loading')}</div>}
        <div>
          <b className="text-fg-body">{t('hrTime.planning.howTitle')}</b>{' '}
          {t('hrTime.planning.howText')}
        </div>
        <div className="flex flex-wrap gap-3 items-center pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-500/30" />
            {t('hrTime.planning.today')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border-l-4 border-amber-500 bg-amber-100 dark:bg-amber-500/20" />
            {t('hrTime.planning.legendIncident')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CopyPlus size={12} className="text-amber-600" /> {t('hrTime.planning.splitShift')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            ⚑ <span>{t('hrTime.planning.legendOverlap')}</span>
          </span>
        </div>
      </div>

      {/* Modal crear / editar */}
      <Modal
        isOpen={!!modal}
        onClose={() => setModal(null)}
        icon={modal?.kind === 'edit' ? <Pencil size={18} /> : <Plus size={18} />}
        title={
          modal?.kind === 'edit' ? t('hrTime.planning.editShift') : t('hrTime.planning.newShift')
        }
        subtitle={
          modal
            ? `${employees.find((e) => e.id === modal.employeeId)?.firstName ?? ''} ${
                employees.find((e) => e.id === modal.employeeId)?.lastName ?? ''
              } · ${formatDate(modal.date, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}`
            : undefined
        }
        size="lg"
        hideCancel
        footer={
          modal && (
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {modal.kind === 'edit' && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={cancelAssign}
                      disabled={!canWrite}
                    >
                      <Ban size={14} /> {t('hrTime.planning.cancelShift')}
                    </Button>
                    <Button size="sm" variant="danger" onClick={removeAssign} disabled={!canDelete}>
                      <Trash2 size={14} /> {t('hr.common.delete')}
                    </Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setModal(null)}>
                  {t('hr.common.close')}
                </Button>
                <Button size="sm" onClick={submitForm} disabled={!canWrite}>
                  <Save size={14} />{' '}
                  {modal.kind === 'edit' ? t('hr.common.save') : t('hr.common.create')}
                </Button>
              </div>
            </div>
          )
        }
      >
        {modal && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">
                {t('hrTime.planning.template')}
              </label>
              <div className="flex flex-wrap gap-2">
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
                      onClick={() => onPickTemplate(t.id)}
                      className={
                        'px-3 py-1.5 rounded-lg text-xs font-bold border-2 ' +
                        (form.shiftTemplateId === t.id
                          ? 'border-indigo-500 ring-2 ring-indigo-300/50'
                          : 'border-border-default hover:border-slate-300')
                      }
                      style={{
                        background:
                          form.shiftTemplateId === t.id ? t.color || '#6366F1' : 'transparent',
                        color: form.shiftTemplateId === t.id ? 'white' : undefined,
                      }}
                    >
                      {t.code} · {t.startTime}–{t.endTime}
                    </Button>
                  ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, shiftTemplateId: '' }))}
                  className={
                    'px-3 py-1.5 rounded-lg text-xs font-bold border-2 ' +
                    (!form.shiftTemplateId
                      ? 'border-slate-500 bg-bg-muted'
                      : 'border-dashed border-border-strong hover:border-slate-400')
                  }
                >
                  {t('hrTime.planning.custom')}
                </Button>
                {templates.length === 0 && (
                  <p className="text-xs text-slate-400 italic">
                    {t('hrTime.planning.noTemplates')}
                  </p>
                )}
              </div>
              {modal.kind === 'edit' &&
                (() => {
                  const tpl: any = form.shiftTemplateId ? tplMap[form.shiftTemplateId] : null;
                  if (!tpl?.secondStartTime || !tpl?.secondEndTime) return null;
                  return (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <CopyPlus size={14} /> {t('hrTime.planning.editingOneBefore')}{' '}
                      <b>{t('hrTime.planning.editingOneBold')}</b>
                      {t('hrTime.planning.editingOneAfter')}
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
                {modal.kind === 'create' && form.secondEnabled
                  ? t('hrTime.planning.segment1Morning')
                  : t('hrTime.planning.segment')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('hrTime.shiftTemplates.start')}
                  type="datetime-local"
                  value={form.startAt.slice(0, 16)}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                />
                <Input
                  label={t('hrTime.shiftTemplates.end')}
                  type="datetime-local"
                  value={form.endAt.slice(0, 16)}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </div>
            </div>

            {/* Tramo 2 (sólo en creación) */}
            {modal.kind === 'create' && (
              <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-500/5 p-3">
                {/* Campo del formulario (se persiste al crear) → Checkbox, que
                      no tiene prop `label`: se conserva el <label> envolvente. */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.secondEnabled}
                    onChange={(checked) => {
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
                  <span className="text-sm font-bold">{t('hrTime.planning.splitSecond')}</span>
                </label>
                {form.secondEnabled && (
                  <>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-2 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black">
                        ②
                      </span>
                      {t('hrTime.planning.segment2Afternoon')}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label={t('hrTime.planning.start2')}
                        type="datetime-local"
                        value={form.secondStartAt.slice(0, 16)}
                        onChange={(e) => setForm({ ...form, secondStartAt: e.target.value })}
                      />
                      <Input
                        label={t('hrTime.planning.end2')}
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
                label={t('hrTime.shiftTemplates.breakMin')}
                type="number"
                min={0}
                value={form.breakMinutes}
                onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) || 0 })}
              />
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1.5 tracking-wider">
                  {t('hrTime.planning.netHours')}
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
                    <div className="px-3 py-2 rounded-lg bg-bg-muted">
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
                  label={t('hr.common.notes')}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Planning;
