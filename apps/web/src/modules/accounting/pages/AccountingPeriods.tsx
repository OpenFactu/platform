import React, { useEffect, useState } from 'react';
import { Table, Card, Button, Input, Loader, useToast, Badge, usePopup } from '@openfactu/ui';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { Calendar, Plus, Trash2, Lock, AlertTriangle } from 'lucide-react';
import { ContextMenu } from '../../../components/common/ContextMenu';
import { withRowContextMenu } from '../../../components/common/withRowContextMenu';
import { useContextMenu } from '../../../hooks/useContextMenu';
import { periodsApi } from '../api';

export const AccountingPeriods: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const canWrite =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.write;
  const canDelete =
    user?.role === 'SUPERUSER' ||
    user?.role === 'ADMIN' ||
    user?.permissions?.[location.pathname]?.delete;
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const toast = useToast();
  const popup = usePopup();

  const fetchPeriods = async () => {
    setLoading(true);
    try {
      const data = await periodsApi.list();
      setPeriods(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.tenantId) fetchPeriods();
  }, [user?.tenantId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await periodsApi.create({
        code: code.toUpperCase(),
        name,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        status: 'O',
      });
      setCode('');
      setName('');
      setStartDate('');
      setEndDate('');
      fetchPeriods();
      toast.success('Periodo creado correctamente');
    } catch (err) {
      toast.error(
        err instanceof Error ? `Error: ${err.message}` : 'Error al crear Periodo',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const openClosePreview = async (periodId: string) => {
    let preview: any;
    try {
      preview = await periodsApi.closePreview(periodId);
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'No se pudo obtener preview');
      return;
    }

    const confirmed = await popup.show<boolean>({
      title: `Cerrar período ${preview.period?.code}`,
      subtitle:
        'Revisa el asiento de regularización y la apertura del siguiente período antes de confirmar. Esta acción es irreversible.',
      tone: 'warning',
      maxWidth: '3xl',
      render: (close) => (
        <ClosePreviewBody
          preview={preview}
          onCancel={() => close(false)}
          onConfirm={() => close(true)}
        />
      ),
    });

    if (!confirmed) return;

    try {
      await periodsApi.close(periodId);
      toast.success('Período cerrado y nuevo período creado');
      fetchPeriods();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Error al cerrar período');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await periodsApi.remove(id);
      fetchPeriods();
      toast.success('Periodo eliminado');
    } catch (err) {
      toast.error('Error al eliminar');
    }
  };

  const columns = [
    {
      header: 'Código',
      sortable: true,
      sortAccessor: (item: any) => item.code || '',
      accessor: 'code',
    },
    {
      header: 'Nombre',
      sortable: true,
      sortAccessor: (item: any) => item.name || '',
      accessor: 'name',
    },
    { header: 'Inicio', cell: (c: any) => new Date(c.startDate).toLocaleDateString() },
    { header: 'Fin', cell: (c: any) => new Date(c.endDate).toLocaleDateString() },
    {
      header: 'Estado',
      cell: (c: any) => {
        const overdue = c.status === 'O' && new Date(c.endDate) < new Date();
        return overdue ? (
          <Badge variant="warning">Pendiente cierre</Badge>
        ) : c.status === 'O' ? (
          <Badge variant="success">Abierto</Badge>
        ) : (
          <Badge variant="neutral">Cerrado</Badge>
        );
      },
    },
    {
      header: 'Acciones',
      align: 'right' as const,
      cell: (c: any) => (
        <div className="flex items-center justify-end gap-2">
          {c.status === 'O' && canWrite && (
            <button
              onClick={() => openClosePreview(c.id)}
              className="text-amber-600 hover:text-amber-700 transition-colors"
              title="Cerrar período"
            >
              <Lock size={16} />
            </button>
          )}
          <button
            onClick={() => canDelete && handleDelete(c.id)}
            disabled={!canDelete}
            className={`transition-colors ${canDelete ? 'text-slate-400 dark:text-slate-500 hover:text-red-500' : 'text-slate-100 cursor-not-allowed grayscale'}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const ctxMenu = useContextMenu<any>();
  const ctxColumns = withRowContextMenu(columns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (c: any) => [
    ...(c.status === 'O' && canWrite
      ? [{ label: 'Cerrar período', icon: <Lock size={14} />, onClick: () => openClosePreview(c.id) }]
      : []),
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      disabled: !canDelete,
      onClick: () => handleDelete(c.id),
    },
  ];

  return (
    <div className="p-8 w-full space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
          <Calendar className="text-blue-600 dark:text-blue-300" size={32} />
          Periodos Contables
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
          Define los ejercicios o años fiscales para acotar la contabilidad y series.
        </p>
      </div>

      <Card className="p-6 border-blue-50 shadow-lg" noPadding>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col md:flex-row gap-4 items-center">
          <div className="flex-[1]">
            <Input
              placeholder="Code (Ej: 2024)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div className="flex-[2]">
            <Input
              placeholder="Nombre (Ej: Ejercicio 2024)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="flex-1">
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={isSubmitting || !canWrite}
            className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale transition-all"
          >
            {isSubmitting ? <Loader size="sm" variant="white" /> : <Plus size={18} />}
            Crear
          </Button>
        </form>
      </Card>

      <Card className="overflow-hidden border-slate-100 dark:border-slate-800" noPadding>
        <Table columns={ctxColumns} data={periods} isLoading={loading} />
      </Card>
      {ctxMenu.state && (
        <ContextMenu
          x={ctxMenu.state.x}
          y={ctxMenu.state.y}
          items={buildCtxItems(ctxMenu.state.data)}
          onClose={ctxMenu.close}
        />
      )}
    </div>
  );
};

interface ClosePreviewBodyProps {
  preview: any;
  onCancel: () => void;
  onConfirm: () => void;
}

const ClosePreviewBody: React.FC<ClosePreviewBodyProps> = ({ preview, onCancel, onConfirm }) => {
  return (
    <div className="space-y-6">
      {preview.blockers?.length > 0 && (
        <div className="border border-red-200 bg-red-50 dark:bg-red-900/20 rounded-lg p-4 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
            <AlertTriangle size={16} />
            Bloqueadores:
          </div>
          <ul className="list-disc ml-6 text-sm text-red-700 dark:text-red-300">
            {preview.blockers.map((b: string, i: number) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-bold mb-2">
          Regularización — Resultado:{' '}
          <span className={preview.resultAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}>
            {Number(preview.resultAmount).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
          </span>
        </h3>
        {preview.regularizationLines?.length > 0 ? (
          <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600">
              <tr>
                <th className="p-2 text-left">Cuenta</th>
                <th className="p-2 text-left">Descripción</th>
                <th className="p-2 text-right">Debe</th>
                <th className="p-2 text-right">Haber</th>
              </tr>
            </thead>
            <tbody>
              {preview.regularizationLines.map((l: any, i: number) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2 font-mono text-xs">{l.accountId}</td>
                  <td className="p-2">{l.description}</td>
                  <td className="p-2 text-right">
                    {Number(l.debit) > 0 ? Number(l.debit).toFixed(2) : ''}
                  </td>
                  <td className="p-2 text-right">
                    {Number(l.credit) > 0 ? Number(l.credit).toFixed(2) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-500">Sin resultados a regularizar.</p>
        )}
      </div>

      <div>
        <h3 className="font-bold mb-2">
          Siguiente período: <code>{preview.nextPeriodCode}</code> ({preview.nextPeriodStart} →{' '}
          {preview.nextPeriodEnd})
        </h3>
        <p className="text-sm text-slate-500 mb-2">
          Se generará asiento de apertura con {preview.openingLines?.length || 0} línea(s) de
          saldos.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={preview.blockers?.length > 0}>
          Confirmar cierre
        </Button>
      </div>
    </div>
  );
};
