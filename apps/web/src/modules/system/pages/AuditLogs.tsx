import { coreApi } from '@/shared/api';
import React, { useEffect, useState, useCallback } from 'react';
import { Card, Button, Loader } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ClipboardList, Search, RotateCcw, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

interface AuditLog {
  id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  userId: string | null;
  oldValue: any;
  newValue: any;
  createdAt: string;
}

const ACTION_CONFIG = {
  CREATE: {
    label: 'Creación',
    className:
      'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 border-emerald-200',
  },
  UPDATE: {
    label: 'Edición',
    className: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-200 border-blue-200',
  },
  DELETE: {
    label: 'Borrado',
    className: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-200 border-rose-200',
  },
};

const ENTITY_TYPES = [
  'Item',
  'Partner',
  'Category',
  'TaxGroup',
  'UnitOfMeasure',
  'Warehouse',
  'Zone',
  'PartnerGroup',
  'AccountingPeriod',
  'DocumentSeries',
  'PriceList',
  'User',
];

const DiffModal: React.FC<{ log: AuditLog; onClose: () => void }> = ({ log, onClose }) => {
  const old = log.oldValue
    ? typeof log.oldValue === 'string'
      ? JSON.parse(log.oldValue)
      : log.oldValue
    : null;
  const next = log.newValue
    ? typeof log.newValue === 'string'
      ? JSON.parse(log.newValue)
      : log.newValue
    : null;
  const keys = Array.from(new Set([...Object.keys(old || {}), ...Object.keys(next || {})])).filter(
    (k) => k !== 'id',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl dark:shadow-none w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Detalle de cambio
            </p>
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
              {log.entityType} · {log.entityId.slice(0, 8)}…
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto p-6">
          {log.action === 'UPDATE' && old && next ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-3 text-left w-1/3">Campo</th>
                  <th className="pb-3 text-left w-1/3">Anterior</th>
                  <th className="pb-3 text-left w-1/3">Nuevo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {keys.map((k) => {
                  const changed = JSON.stringify(old[k]) !== JSON.stringify(next[k]);
                  return (
                    <tr key={k} className={changed ? 'bg-amber-50/50' : ''}>
                      <td className="py-2 font-medium text-slate-600 dark:text-slate-300">{k}</td>
                      <td
                        className={`py-2 font-mono text-xs ${changed ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}
                      >
                        {old[k] === null || old[k] === undefined ? (
                          <span className="opacity-30 italic">null</span>
                        ) : (
                          String(old[k]).slice(0, 80)
                        )}
                      </td>
                      <td
                        className={`py-2 font-mono text-xs ${changed ? 'text-emerald-700 dark:text-emerald-200 font-semibold' : 'text-slate-500 dark:text-slate-400'}`}
                      >
                        {next[k] === null || next[k] === undefined ? (
                          <span className="opacity-30 italic">null</span>
                        ) : (
                          String(next[k]).slice(0, 80)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <pre className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 text-xs font-mono text-slate-700 dark:text-slate-200 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(log.action === 'DELETE' ? old : next, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

export const AuditLogs: React.FC = () => {
  const { token, user } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const [filters, setFilters] = useState({
    entityType: '',
    action: '',
    dateFrom: '',
    dateTo: '',
  });
  const [page, setPage] = useState(1);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filters.entityType) params.set('entityType', filters.entityType);
      if (filters.action) params.set('action', filters.action);
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);

      const res = await coreApi.raw('GET', `/api/audit-logs?${params}`);
      const data = res.data;
      setLogs(Array.isArray(data.data) ? data.data : []);
      setTotal(data.total ?? 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [token, user?.tenantId, filters, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleReset = () => {
    setFilters({ entityType: '', action: '', dateFrom: '', dateTo: '' });
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      {selectedLog && <DiffModal log={selectedLog} onClose={() => setSelectedLog(null)} />}

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-violet-600 rounded-lg text-white">
              <ClipboardList size={20} />
            </span>
            <span className="text-[10px] font-black text-violet-600 uppercase tracking-[0.2em]">
              Gestión Central / Seguridad
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Registros de Auditoría
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Histórico completo de creaciones, modificaciones y eliminaciones.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {total.toLocaleString()}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
            registros totales
          </p>
        </div>
      </header>

      {/* Filtros */}
      <Card className="border-0">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Entidad
            </label>
            <select
              value={filters.entityType}
              onChange={(e) => {
                setFilters((f) => ({ ...f, entityType: e.target.value }));
                setPage(1);
              }}
              className="w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            >
              <option value="">Todas</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Acción
            </label>
            <select
              value={filters.action}
              onChange={(e) => {
                setFilters((f) => ({ ...f, action: e.target.value }));
                setPage(1);
              }}
              className="w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            >
              <option value="">Todas</option>
              <option value="CREATE">Creación</option>
              <option value="UPDATE">Edición</option>
              <option value="DELETE">Borrado</option>
            </select>
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Desde
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => {
                setFilters((f) => ({ ...f, dateFrom: e.target.value }));
                setPage(1);
              }}
              className="w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">
              Hasta
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => {
                setFilters((f) => ({ ...f, dateTo: e.target.value }));
                setPage(1);
              }}
              className="w-full h-10 px-3 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchLogs} className="h-10 gap-2">
              <Search size={16} />
              Filtrar
            </Button>
            <Button
              variant="secondary"
              onClick={handleReset}
              className="h-10 gap-2 text-slate-500 dark:text-slate-400"
            >
              <RotateCcw size={14} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden border-0" noPadding>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 text-[10px] uppercase font-black text-slate-400 dark:text-slate-500">
              <th className="p-4 pl-6">Fecha / Hora</th>
              <th className="p-4">Acción</th>
              <th className="p-4">Entidad</th>
              <th className="p-4">ID Entidad</th>
              <th className="p-4">Usuario</th>
              <th className="p-4 text-right pr-6">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && (
              <tr>
                <td colSpan={6} className="p-20 text-center">
                  <Loader size="lg" />
                  <p className="text-slate-400 dark:text-slate-500 mt-4 font-medium italic">
                    Cargando registros...
                  </p>
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-20 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-200">
                      <ClipboardList size={32} />
                    </div>
                    <p className="font-medium">No se encontraron registros de auditoría.</p>
                  </div>
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => {
                const actionCfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.CREATE;
                const date = new Date(log.createdAt);
                const hasDetail = log.oldValue || log.newValue;
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-4 pl-6">
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-sm tabular-nums">
                        {date.toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                        {date.toLocaleTimeString('es-ES', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </p>
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${actionCfg.className}`}
                      >
                        {actionCfg.label}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                        {log.entityType}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                        {log.entityId.slice(0, 12)}…
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        {log.userId ? (
                          log.userId.slice(0, 12) + '…'
                        ) : (
                          <span className="opacity-40 italic">sistema</span>
                        )}
                      </span>
                    </td>
                    <td className="p-4 text-right pr-6">
                      {hasDetail && (
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Eye size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {/* Paginación */}
        {!loading && total > limit && (
          <div className="flex items-center justify-between p-4 pl-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Mostrando {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de{' '}
              {total.toLocaleString()} registros
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-black text-slate-700 dark:text-slate-200 px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
