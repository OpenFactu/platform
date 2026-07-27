import {
  payrollsApi,
  employeesApi,
  contractsApi,
  payrollConceptsApi,
  commissionsApi,
} from '../api';
import type { Payroll } from '../domain/payroll';
import type { Employee } from '../domain/employee';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Table,
  Card,
  Button,
  useToast,
  Badge,
  usePopup,
  Checkbox,
  SearchableSelect,
  NumberInput,
  CurrencyInput,
} from '@openfactu/ui';
import type { BadgeProps, RowAction } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { usePagePermissions } from '@/hooks/usePagePermissions';
import {
  Banknote,
  Plus,
  CheckCircle,
  Trash2,
  ListPlus,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ApiError } from '@/shared/http';

const STATUS_VARIANTS: Record<string, BadgeProps['variant']> = {
  draft: 'neutral',
  approved: 'success',
  paid: 'info',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  approved: 'Aprobada',
  paid: 'Pagada',
};
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const Payrolls: React.FC = () => {
  const { token, user } = useAuth();
  const { canWrite, canDelete } = usePagePermissions();
  const [rows, setRows] = useState<Payroll[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<any>({
    employeeId: '',
    periodYear: new Date().getFullYear(),
    periodMonth: new Date().getMonth() + 1,
    autoSalary: true,
    autoTaxes: true,
  });
  const toast = useToast();
  const popup = usePopup();
  const [editLines, setEditLines] = useState<Payroll | null>(null);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([payrollsApi.list(), employeesApi.list()]);
      setRows(Array.isArray(p) ? p : []);
      setEmployees(Array.isArray(e) ? e : []);
    } catch {
      toast.error('Error al cargar nóminas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchAll();
  }, [user?.tenantId]);

  const empMap = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  // Opciones de los desplegables: una vez por render en lugar de una por opción.
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
  const conceptOptions = useMemo(
    () =>
      concepts.map((c: any) => ({
        value: c.id,
        label: `${c.code} · ${c.name}`,
        secondaryLabel: c.kind,
      })),
    [concepts],
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId) {
      toast.error('Selecciona un empleado');
      return;
    }
    // 1) Crear borrador con totales a 0 — las líneas marcan los importes.
    const res = await payrollsApi.createSafe({
      employeeId: form.employeeId,
      periodYear: form.periodYear,
      periodMonth: form.periodMonth,
    });
    const created = res.data;
    if (res.status === 409 && created.existingId) {
      toast.error(created.error || 'Ya existe esa nómina');
      // Abrir directamente la existente para que el usuario la edite.
      const existing = await payrollsApi.get(created.existingId).catch(() => null);
      if (existing) {
        setCreating(false);
        openLines(existing);
      }
      return;
    }
    if (!res.ok) {
      toast.error(created.error || 'Error al crear');
      return;
    }
    const createdPayroll = created as Payroll;

    // 2) Si se ha pedido prellenar con el contrato, añadir línea "Salario base"
    //    usando el grossSalary del contrato activo del empleado.
    if (form.autoSalary) {
      try {
        const contracts = await contractsApi.listByEmployee(form.employeeId);
        const active =
          (Array.isArray(contracts) ? contracts : []).find((c: any) => c.isActive) ||
          (Array.isArray(contracts) ? contracts[0] : null);
        const monthlyGross = active
          ? Number(active.grossSalary || 0) / Number(active.paymentsPerYear || 12)
          : 0;
        if (monthlyGross > 0) {
          // Buscar concepto "Salario base" del catálogo o crear línea suelta.
          const cs = await payrollConceptsApi.list(true);
          const base = (Array.isArray(cs) ? cs : []).find(
            (c: any) =>
              c.kind === 'devengo' &&
              (/salario.*base/i.test(c.name) || /^sb/i.test(c.code) || /base/i.test(c.code)),
          );
          await payrollsApi.addLine(createdPayroll.id, {
            conceptId: base?.id || null,
            concept: base?.name || 'Salario base',
            type: 'earning',
            amount: monthlyGross.toFixed(2),
          });
        }
      } catch {
        /* no-op — el usuario puede añadirlas a mano luego */
      }
    }

    // 3) Auto-IRPF/SS si está marcado.
    if (form.autoTaxes) {
      await payrollsApi.autoDeductions(createdPayroll.id);
    }

    toast.success('Nómina creada — abre líneas/pluses para ajustar');
    setCreating(false);
    fetchAll();
    // Abrir directamente el editor de líneas con los datos ya prellenados.
    openLines(createdPayroll);
  };

  const handleApprove = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Aprobar nómina',
      message:
        'Se aprobará y se generará automáticamente el asiento contable asociado. Esta acción no se puede deshacer.',
      confirmLabel: 'Aprobar y asentar',
    });
    if (!ok) return;
    try {
      await payrollsApi.approve(id);
      toast.success('Nómina aprobada y asiento contable generado');
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error al aprobar',
      );
    }
  };

  const openLines = async (p: Payroll) => {
    setEditLines(p);
    setLinesLoading(true);
    try {
      const [conceptsR, payrollR] = await Promise.all([
        payrollConceptsApi.list(true),
        payrollsApi.get(p.id),
      ]);
      setConcepts(Array.isArray(conceptsR) ? conceptsR : []);
      setLines(Array.isArray(payrollR.lines) ? payrollR.lines : []);
    } finally {
      setLinesLoading(false);
    }
  };

  const refreshLines = async (id: string) => {
    const d = await payrollsApi.get(id);
    setLines(Array.isArray(d.lines) ? d.lines : []);
    setEditLines((curr) => (curr ? { ...curr, ...d } : curr));
    fetchAll();
  };

  const addLine = async (conceptId: string) => {
    if (!editLines) return;
    const c = concepts.find((x) => x.id === conceptId);
    if (!c) return;
    const lineType =
      c.kind === 'devengo'
        ? 'earning'
        : c.kind === 'aportacion_empresa'
          ? 'employer_cost'
          : 'deduction';
    const payload: any = {
      conceptId: c.id,
      concept: c.name,
      type: lineType,
      amount: c.defaultAmount ? Number(c.defaultAmount) : 0,
    };
    if (c.calculation === 'percent_of_base' && c.defaultPercent)
      payload.rate = Number(c.defaultPercent);
    try {
      await payrollsApi.addLine(editLines.id, payload);
      await refreshLines(editLines.id);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? ((err.body as any)?.error ?? err.message)
          : 'Error al añadir línea',
      );
    }
  };

  const updateLine = async (lineId: string, patch: any) => {
    if (!editLines) return;
    try {
      await payrollsApi.updateLine(editLines.id, lineId, patch);
      await refreshLines(editLines.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const deleteLine = async (lineId: string) => {
    if (!editLines) return;
    try {
      await payrollsApi.removeLine(editLines.id, lineId);
      await refreshLines(editLines.id);
    } catch {
      /* fallo silencioso — mismo comportamiento que el código original */
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await popup.confirm({
      title: 'Eliminar borrador',
      message: 'Solo se puede eliminar si está en borrador.',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await payrollsApi.remove(id);
      toast.success('Eliminada');
      fetchAll();
    } catch (err) {
      toast.error(err instanceof ApiError ? ((err.body as any)?.error ?? err.message) : 'Error');
    }
  };

  const columns = [
    {
      header: 'Empleado',
      cell: (r: Payroll) =>
        empMap[r.employeeId]
          ? `${empMap[r.employeeId].firstName} ${empMap[r.employeeId].lastName}`
          : r.employeeId,
    },
    {
      header: 'Período',
      cell: (r: Payroll) => `${MONTHS[r.periodMonth - 1]} ${r.periodYear}`,
    },
    {
      header: 'Bruto',
      align: 'right' as const,
      cell: (r: Payroll) =>
        Number(r.gross).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €',
    },
    {
      header: 'Neto',
      align: 'right' as const,
      cell: (r: Payroll) => (
        <b>{Number(r.netPay).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</b>
      ),
    },
    {
      header: 'Estado',
      cell: (r: Payroll) => (
        <Badge variant={STATUS_VARIANTS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
      ),
    },
  ];

  const printPayslip = async (r: Payroll) => {
    try {
      const { blob } = await payrollsApi.payslipPdf(r.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
    } catch {
      toast.error('No se pudo generar el PDF');
    }
  };

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que las condiciones de estado
  // (solo un borrador se aprueba o se elimina) se declaran una vez en lugar de
  // duplicarse entre una columna de botones y el menú.
  const rowActions = (r: Payroll): RowAction[] => [
    {
      label: r.status === 'draft' ? 'Editar líneas / pluses' : 'Ver líneas',
      icon: <ListPlus size={14} />,
      onClick: () => openLines(r),
    },
    {
      label: 'Imprimir / descargar recibo',
      icon: <FileText size={14} />,
      onClick: () => printPayslip(r),
    },
    ...(r.status === 'draft'
      ? [
          {
            label: 'Aprobar y asentar',
            icon: <CheckCircle size={14} />,
            disabled: !canWrite,
            onClick: () => handleApprove(r.id),
            separatorBefore: true,
          },
          {
            label: 'Eliminar',
            icon: <Trash2 size={14} />,
            destructive: true,
            disabled: !canDelete,
            onClick: () => handleDelete(r.id),
          },
        ]
      : []),
  ];

  return (
    <div className="p-4 w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-fg-default flex items-center gap-3 tracking-tight">
            <Banknote className="text-emerald-600 dark:text-emerald-300" size={32} />
            Nóminas
          </h1>
          <p className="text-fg-muted mt-1 font-medium text-sm max-w-2xl">
            Cómo funciona: 1) <b>"Generar mes en curso"</b> crea un borrador para cada empleado con
            salario base + IRPF + SS automáticos. 2) Edita líneas/pluses si hace falta. 3) Aprueba →
            se genera el asiento contable (gasto de personal, SS e IRPF).
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const y = new Date().getFullYear();
                const m = new Date().getMonth() + 1;
                const ok = await popup.confirm({
                  title: `Generar nóminas de ${MONTHS[m - 1]} ${y}`,
                  message:
                    'Crea un borrador de nómina para cada empleado activo, con salario base de su contrato y IRPF/SS automáticos. ¿Continuar?',
                  confirmLabel: 'Generar',
                });
                if (!ok) return;
                const active = employees.filter((e: any) => e.status === 'active');
                let n = 0;
                let skipped = 0;
                for (const e of active) {
                  try {
                    const r = await payrollsApi.createSafe({
                      employeeId: e.id,
                      periodYear: y,
                      periodMonth: m,
                    });
                    const d = r.data;
                    if (r.status === 409) {
                      skipped++;
                      continue;
                    }
                    if (!r.ok) continue;
                    // Salario base del contrato
                    const cs = await contractsApi.listByEmployee(e.id).catch(() => []);
                    const c =
                      (Array.isArray(cs) ? cs : []).find((x: any) => x.isActive) ||
                      (Array.isArray(cs) ? cs[0] : null);
                    if (c) {
                      const monthly = Number(c.grossSalary || 0) / Number(c.paymentsPerYear || 12);
                      if (monthly > 0) {
                        await payrollsApi.addLine(d.id!, {
                          concept: 'Salario base',
                          type: 'earning',
                          amount: monthly.toFixed(2),
                        });
                      }
                    }
                    await payrollsApi.autoDeductions(d.id!);
                    n++;
                  } catch {
                    /* sigue con el siguiente empleado */
                  }
                }
                if (n === 0 && skipped > 0) {
                  toast.success(`Sin novedades · ${skipped} ya existían`);
                } else if (skipped > 0) {
                  toast.success(`Generadas ${n} · ${skipped} ya existían`);
                } else {
                  toast.success(`Generadas ${n} nóminas`);
                }
                fetchAll();
              }}
              title="Crea un borrador de nómina por cada empleado activo con salario y deducciones automáticas"
            >
              <CheckCircle size={14} /> Generar mes en curso
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} /> Nueva nómina
            </Button>
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="max-w-xl w-full" noPadding>
            <form onSubmit={handleCreate} className="p-6 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Plus size={18} /> Nueva nómina
                  </h2>
                  <p className="text-xs text-slate-500">
                    Sólo elige empleado y mes. Las líneas (salario base, pluses, IRPF, SS) se
                    rellenan automáticamente y luego puedes ajustarlas.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
                  <X size={20} />
                </Button>
              </div>

              <div>
                {/* SearchableSelect no tiene prop `label`, así que se conserva
                    el <label> suelto. El `required` del <select> nativo era
                    redundante: handleCreate ya avisa si no hay empleado. */}
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Empleado
                </label>
                <SearchableSelect
                  options={employeeOptions}
                  value={form.employeeId}
                  onChange={(v) => setForm({ ...form, employeeId: v })}
                  placeholder="— seleccionar —"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Periodo
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    title="Mes anterior"
                    onClick={() => {
                      const d = new Date(form.periodYear, form.periodMonth - 2, 1);
                      setForm({
                        ...form,
                        periodYear: d.getFullYear(),
                        periodMonth: d.getMonth() + 1,
                      });
                    }}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <div className="flex-1 text-center text-sm font-bold tabular-nums">
                    {MONTHS[form.periodMonth - 1]} {form.periodYear}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    title="Mes siguiente"
                    onClick={() => {
                      const d = new Date(form.periodYear, form.periodMonth, 1);
                      setForm({
                        ...form,
                        periodYear: d.getFullYear(),
                        periodMonth: d.getMonth() + 1,
                      });
                    }}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {MONTHS.map((m, i) => (
                    <Button
                      key={i}
                      type="button"
                      size="sm"
                      variant={form.periodMonth === i + 1 ? 'primary' : 'secondary'}
                      onClick={() => setForm({ ...form, periodMonth: i + 1 })}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border-default p-3 space-y-2">
                {/* Campos del formulario (se aplican al crear, no al instante):
                    Checkbox, que no tiene prop `label` — se conserva el <label>. */}
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.autoSalary}
                    onChange={(checked) => setForm({ ...form, autoSalary: checked })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-bold">Prellenar salario base del contrato</div>
                    <div className="text-xs text-slate-500">
                      Toma <code>grossSalary / paymentsPerYear</code> del contrato activo y lo añade
                      como línea "Salario base".
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.autoTaxes}
                    onChange={(checked) => setForm({ ...form, autoTaxes: checked })}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-bold">Generar IRPF y SS automáticamente</div>
                    <div className="text-xs text-slate-500">
                      Añade los conceptos "% de base" del catálogo (IRPF, SS empleado, SS empresa).
                    </div>
                  </div>
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCreating(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={!canWrite}>
                  Crear y abrir líneas
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden border-border-subtle" noPadding>
        <Table columns={columns} data={rows} isLoading={loading} rowActions={rowActions} />
      </Card>

      {editLines && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-w-4xl w-full max-h-[85vh] overflow-auto p-6" noPadding>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <ListPlus size={20} />
                    Editar líneas / pluses
                  </h2>
                  <p className="text-sm text-fg-muted">
                    {empMap[editLines.employeeId]
                      ? `${empMap[editLines.employeeId].firstName} ${empMap[editLines.employeeId].lastName}`
                      : editLines.employeeId}
                    {' — '}
                    {MONTHS[editLines.periodMonth - 1]} {editLines.periodYear}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditLines(null)}>
                  <X size={20} />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                {/* Actúa como acción, no como campo: el valor vuelve siempre a
                    vacío tras añadir la línea. */}
                <SearchableSelect
                  options={conceptOptions}
                  value=""
                  onChange={(v) => {
                    if (v) addLine(v);
                  }}
                  placeholder="— añadir concepto del catálogo —"
                  className="flex-1"
                  disabled={!canWrite}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  disabled={!canWrite}
                  onClick={async () => {
                    if (!editLines) return;
                    try {
                      const d = await payrollsApi.autoDeductions(editLines.id);
                      if (d.created === 0) {
                        toast.success('IRPF/SS ya estaban añadidos. Recalculado.');
                      } else {
                        toast.success(`Añadidos ${d.created} conceptos automáticos`);
                      }
                      await refreshLines(editLines.id);
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? ((err.body as any)?.error ?? err.message)
                          : 'No hay conceptos IRPF/SS en el catálogo',
                      );
                    }
                  }}
                  title="Añade IRPF y SS Empleado/Empresa automáticamente del catálogo"
                >
                  Auto IRPF/SS
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  className="whitespace-nowrap"
                  disabled={!canWrite}
                  onClick={async () => {
                    if (!editLines) return;
                    try {
                      const d = await commissionsApi.importToPayroll(editLines.id);
                      if (d.imported === 0) {
                        toast.success('No hay comisiones pendientes para este periodo');
                      } else {
                        toast.success(
                          `Importadas ${d.imported} comisiones · ${Number(d.total).toFixed(2)} €`,
                        );
                      }
                      await refreshLines(editLines.id);
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? ((err.body as any)?.error ?? err.message)
                          : 'Error',
                      );
                    }
                  }}
                  title="Vuelca las comisiones del periodo del empleado a esta nómina como línea de devengo"
                >
                  Importar comisiones
                </Button>
              </div>

              {/* Aviso si hay devengos pero faltan deducciones de impuestos */}
              {(() => {
                const hasEarnings = lines.some((l: any) => l.type === 'earning');
                const hasIrpf = lines.some(
                  (l: any) => /irpf/i.test(l.concept || '') && l.type === 'deduction',
                );
                const hasSs = lines.some(
                  (l: any) =>
                    l.type === 'deduction' &&
                    (/^ss/i.test(l.concept || '') || /seguridad social/i.test(l.concept || '')),
                );
                if (hasEarnings && (!hasIrpf || !hasSs)) {
                  return (
                    <div className="px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-700 text-xs text-amber-700 dark:text-amber-300">
                      ⚠ Esta nómina tiene devengos pero le falta {!hasIrpf && <b>IRPF</b>}
                      {!hasIrpf && !hasSs && ' y '}
                      {!hasSs && <b>SS Empleado</b>}. El neto que ves no es real. Pulsa "Auto
                      IRPF/SS" o añade los conceptos manualmente.
                    </div>
                  );
                }
                return null;
              })()}

              {linesLoading ? (
                <div className="text-center text-sm text-slate-400 py-6">Cargando…</div>
              ) : lines.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-6 italic">
                  Esta nómina aún no tiene líneas. Añade conceptos del catálogo o pulsa "Auto
                  IRPF/SS".
                </div>
              ) : (
                <div className="space-y-4">
                  {(
                    [
                      {
                        key: 'earning',
                        title: '➕ Devengos',
                        desc: 'Lo que cobra el empleado (salario, pluses, horas extra…)',
                        tone: 'emerald',
                      },
                      {
                        key: 'deduction',
                        title: '➖ Deducciones',
                        desc: 'Lo que se le retiene (IRPF, SS empleado, anticipos…)',
                        tone: 'rose',
                      },
                      {
                        key: 'employer_cost',
                        title: '🏢 Coste empresa',
                        desc: 'Aportaciones que paga la empresa (SS empresa)',
                        tone: 'indigo',
                      },
                    ] as const
                  ).map((grp) => {
                    const grpLines = lines.filter((l: any) => l.type === grp.key);
                    return (
                      <div
                        key={grp.key}
                        className="rounded-lg border border-border-default overflow-hidden"
                      >
                        <div
                          className={
                            'px-3 py-2 text-xs font-bold flex items-center justify-between ' +
                            (grp.tone === 'emerald'
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : grp.tone === 'rose'
                                ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                                : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300')
                          }
                        >
                          <span>{grp.title}</span>
                          <span className="font-normal text-[10px] opacity-80">{grp.desc}</span>
                        </div>
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="text-left text-xs text-slate-500 border-b">
                              <th className="py-2 px-3">Concepto</th>
                              <th className="py-2 pr-2 text-right w-20">Cant.</th>
                              <th className="py-2 pr-2 text-right w-24">€/%</th>
                              <th className="py-2 pr-2 text-right w-24">Base</th>
                              <th className="py-2 pr-2 text-right w-28">Importe</th>
                              <th className="py-2 pr-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {grpLines.length === 0 && (
                              <tr>
                                <td
                                  colSpan={6}
                                  className="py-3 px-3 text-center text-xs text-slate-400 italic"
                                >
                                  {grp.key === 'earning'
                                    ? 'Aún no hay devengos. Añade "Salario base" desde el desplegable de arriba para que el bruto sea > 0 y los % se calculen.'
                                    : grp.key === 'deduction'
                                      ? 'Aún no hay deducciones. Pulsa "Auto IRPF/SS".'
                                      : 'Aún no hay aportaciones de empresa.'}
                                </td>
                              </tr>
                            )}
                            {grpLines.map((l: any) => (
                              <PayrollLineRow
                                key={l.id}
                                line={l}
                                onUpdate={updateLine}
                                onDelete={deleteLine}
                                canWrite={canWrite}
                                canDelete={canDelete}
                              />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm pt-3 border-t">
                <div>
                  <div className="text-xs text-slate-400">Bruto</div>
                  <div className="font-bold">{Number(editLines.gross).toFixed(2)} €</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">IRPF</div>
                  <div className="font-bold">{Number(editLines.irpfAmount).toFixed(2)} €</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">SS Trab.</div>
                  <div className="font-bold">{Number(editLines.ssEmployee).toFixed(2)} €</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">SS Empresa</div>
                  <div className="font-bold">{Number(editLines.ssEmployer).toFixed(2)} €</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Neto</div>
                  <div className="font-black text-emerald-600">
                    {Number(editLines.netPay).toFixed(2)} €
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setEditLines(null)}>Cerrar</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

/** Enter fuerza el blur, que es lo que dispara el guardado. */
const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
};

/**
 * Fila controlada del editor de líneas. Mantiene su propio estado de los
 * campos (cantidad, rate, base, importe) sincronizado con la línea del
 * servidor: cada vez que la prop `line` cambia (recalc / fetch), los inputs
 * reflejan el nuevo valor. El cambio se persiste con `commitOn="blur"` (al
 * salir del campo) o con Enter, así no spameamos el servidor en cada tecla.
 */
const PayrollLineRow: React.FC<{
  line: any;
  onUpdate: (id: string, patch: any) => Promise<void> | void;
  onDelete: (id: string) => void;
  canWrite: boolean;
  canDelete: boolean;
}> = ({ line, onUpdate, onDelete, canWrite, canDelete }) => {
  // number | null puro: antes eran strings porque venían de e.target.value de
  // los <input type="number">; con NumberInput/CurrencyInput el valor ya llega
  // numérico y `null` representa el campo vacío.
  const num = (v: any) => (v == null || v === '' ? null : Number(v));
  const [qty, setQty] = useState<number | null>(num(line.quantity));
  const [rate, setRate] = useState<number | null>(num(line.rate));
  const [base, setBase] = useState<number | null>(num(line.baseAmount));
  const [amount, setAmount] = useState<number | null>(num(line.amount ?? 0));

  // Sincroniza con la prop cuando el servidor recalcula (p.ej. añadir IRPF).
  useEffect(() => {
    setQty(num(line.quantity));
    setRate(num(line.rate));
    setBase(num(line.baseAmount));
    setAmount(num(line.amount ?? 0));
  }, [line.quantity, line.rate, line.baseAmount, line.amount]);

  const commit = async (patch: any) => {
    await onUpdate(line.id, patch);
  };

  return (
    <tr className="border-b border-border-subtle">
      <td className="py-2 px-3">
        <div className="font-medium">{line.concept}</div>
      </td>
      <td className="py-2 pr-2 text-right">
        <NumberInput
          value={qty}
          precision={2}
          commitOn="blur"
          onChange={(v) => {
            setQty(v);
            commit({ quantity: v });
          }}
          onKeyDown={blurOnEnter}
          inputSize="sm"
          containerClassName="w-20"
          disabled={!canWrite}
        />
      </td>
      <td className="py-2 pr-2 text-right">
        {/* €/unidad o % según el concepto: NumberInput genérico con 3
            decimales, la resolución que tenía el step="0.001" original. */}
        <NumberInput
          value={rate}
          precision={3}
          commitOn="blur"
          onChange={(v) => {
            setRate(v);
            commit({ rate: v });
          }}
          onKeyDown={blurOnEnter}
          inputSize="sm"
          containerClassName="w-24"
          disabled={!canWrite}
        />
      </td>
      <td className="py-2 pr-2 text-right">
        {/* `allowNegative` explícito: CurrencyInput lo desactiva por defecto y
            una regularización de nómina sí puede ir en negativo. */}
        <CurrencyInput
          value={base}
          allowNegative
          commitOn="blur"
          onChange={(v) => {
            setBase(v);
            commit({ baseAmount: v });
          }}
          onKeyDown={blurOnEnter}
          inputSize="sm"
          containerClassName="w-24"
          disabled={!canWrite}
        />
      </td>
      <td className="py-2 pr-2 text-right">
        <CurrencyInput
          value={amount}
          allowNegative
          emptyValue="zero"
          commitOn="blur"
          onChange={(v) => {
            setAmount(v ?? 0);
            commit({ amount: v ?? 0 });
          }}
          onKeyDown={blurOnEnter}
          inputSize="sm"
          containerClassName="w-28"
          className="font-bold"
          disabled={!canWrite}
        />
      </td>
      <td className="py-2 pr-2 text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(line.id)}
          disabled={!canDelete}
          title="Eliminar línea"
        >
          <Trash2 size={14} />
        </Button>
      </td>
    </tr>
  );
};

export default Payrolls;
