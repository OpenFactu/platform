import { coreApi } from '@/shared/api';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Button,
  Loader,
  Modal,
  Select,
  SearchableSelect,
  DatePicker,
  EmptyState,
  Pagination,
} from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import { ClipboardList, Search, RotateCcw, Eye } from 'lucide-react';

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

// Las opciones del filtro salen de ACTION_CONFIG para no repetir los valores;
// la primera es el «sin filtro» que antes era <option value="">.
const ACTION_OPTIONS = [
  { value: '', label: 'Todas' },
  ...Object.entries(ACTION_CONFIG).map(([value, cfg]) => ({ value, label: cfg.label })),
];

// Único label que sigue a mano (SearchableSelect no tiene prop `label`); imita
// el estilo del label que pintan Select y DatePicker para que los cuatro
// filtros de la fila se vean iguales.
const filterLabelCls = 'block text-[12px] font-medium text-fg-body mb-1.5';

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
    // El overlay, la cabecera con antetítulo y la X de cerrar los aporta Modal;
    // se conserva el cierre al pulsar fuera que tenía el diálogo a mano.
    <Modal
      isOpen
      onClose={onClose}
      eyebrow="Detalle de cambio"
      title={`${log.entityType} · ${log.entityId.slice(0, 8)}…`}
      size="2xl"
      closeOnOverlayClick
    >
      {log.action === 'UPDATE' && old && next ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-black text-fg-subtle uppercase tracking-widest border-b border-border-subtle">
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
                  <td className="py-2 font-medium text-fg-body">{k}</td>
                  <td
                    className={`py-2 font-mono text-xs ${changed ? 'text-rose-600 dark:text-rose-300' : 'text-fg-muted'}`}
                  >
                    {old[k] === null || old[k] === undefined ? (
                      <span className="opacity-30 italic">null</span>
                    ) : (
                      String(old[k]).slice(0, 80)
                    )}
                  </td>
                  <td
                    className={`py-2 font-mono text-xs ${changed ? 'text-emerald-700 dark:text-emerald-200 font-semibold' : 'text-fg-muted'}`}
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
        <pre className="bg-bg-muted rounded-xl p-4 text-xs font-mono text-fg-body overflow-auto whitespace-pre-wrap">
          {JSON.stringify(log.action === 'DELETE' ? old : next, null, 2)}
        </pre>
      )}
    </Modal>
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
          <h1 className="text-4xl font-black text-fg-default tracking-tight">
            Registros de Auditoría
          </h1>
          <p className="text-fg-muted font-medium">
            Histórico completo de creaciones, modificaciones y eliminaciones.
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-fg-default">{total.toLocaleString()}</p>
          <p className="text-xs text-fg-subtle font-bold uppercase tracking-widest">
            registros totales
          </p>
        </div>
      </header>

      {/* Filtros */}
      <Card className="border-0">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[160px]">
            {/* 12 entidades: pasa del umbral de Select, así que va con buscador.
                SearchableSelect no tiene prop `label`, se conserva el <label>. */}
            <label className={filterLabelCls}>Entidad</label>
            <SearchableSelect
              value={filters.entityType}
              onChange={(v) => {
                setFilters((f) => ({ ...f, entityType: v }));
                setPage(1);
              }}
              options={ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
              placeholder="Todas"
              clearable
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Select
              label="Acción"
              value={filters.action}
              onChange={(v) => {
                setFilters((f) => ({ ...f, action: v }));
                setPage(1);
              }}
              options={ACTION_OPTIONS}
              placeholder="Todas"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <DatePicker
              label="Desde"
              value={filters.dateFrom || null}
              onChange={(v) => {
                setFilters((f) => ({ ...f, dateFrom: v ?? '' }));
                setPage(1);
              }}
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <DatePicker
              label="Hasta"
              value={filters.dateTo || null}
              onChange={(v) => {
                setFilters((f) => ({ ...f, dateTo: v ?? '' }));
                setPage(1);
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchLogs} className="h-10 gap-2">
              <Search size={16} />
              Filtrar
            </Button>
            <Button variant="secondary" onClick={handleReset} className="h-10 gap-2 text-fg-muted">
              <RotateCcw size={14} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabla */}
      <Card className="overflow-hidden border-0" noPadding>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-bg-muted border-b border-border-subtle text-[10px] uppercase font-black text-fg-subtle">
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
                  <p className="text-fg-subtle mt-4 font-medium italic">Cargando registros...</p>
                </td>
              </tr>
            )}
            {!loading && logs.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={<ClipboardList size={32} />}
                    title="No se encontraron registros de auditoría"
                    hint="Prueba a ampliar el rango de fechas o a quitar filtros."
                  />
                </td>
              </tr>
            )}
            {!loading &&
              logs.map((log) => {
                const actionCfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.CREATE;
                const date = new Date(log.createdAt);
                const hasDetail = log.oldValue || log.newValue;
                return (
                  <tr key={log.id} className="hover:bg-bg-hover transition-colors group">
                    <td className="p-4 pl-6">
                      <p className="font-bold text-fg-default text-sm tabular-nums">
                        {date.toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="text-[10px] text-fg-subtle font-mono tabular-nums">
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
                      <span className="font-bold text-fg-body text-sm">{log.entityType}</span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-xs text-fg-muted bg-bg-muted px-2 py-1 rounded-lg">
                        {log.entityId.slice(0, 12)}…
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs text-fg-muted font-medium">
                        {log.userId ? (
                          log.userId.slice(0, 12) + '…'
                        ) : (
                          <span className="opacity-40 italic">sistema</span>
                        )}
                      </span>
                    </td>
                    <td className="p-4 text-right pr-6">
                      {hasDetail && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedLog(log)}
                          title="Ver detalle"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Eye size={16} />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {/* Paginación */}
        {!loading && total > limit && (
          // Pagination ya trae el «desde–hasta de total», el indicador de página y
          // los botones de anterior/siguiente con su estado deshabilitado.
          <Pagination
            page={page}
            pageSize={limit}
            total={total}
            onPageChange={(p) => setPage(Math.min(totalPages, Math.max(1, p)))}
            pageSizeOptions={[]}
            className="p-4 pl-6 border-t border-border-subtle bg-bg-muted"
          />
        )}
      </Card>
    </div>
  );
};
