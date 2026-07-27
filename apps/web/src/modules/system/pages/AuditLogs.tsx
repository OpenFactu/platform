import { coreApi } from '@/shared/api';
import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  Button,
  Modal,
  Select,
  SearchableSelect,
  DatePicker,
  EmptyState,
  Badge,
  Table,
} from '@openfactu/ui';
import type { BadgeProps, RowAction, TableColumn } from '@openfactu/ui';
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

// El color de cada acción sale ahora del Badge del paquete (variantes
// semánticas) en vez de una paleta fija que no seguía al tema del tenant.
const ACTION_CONFIG: Record<AuditLog['action'], { label: string; variant: BadgeProps['variant'] }> =
  {
    CREATE: { label: 'Creación', variant: 'success' },
    UPDATE: { label: 'Edición', variant: 'info' },
    DELETE: { label: 'Borrado', variant: 'error' },
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

  // Una fila por campo, con marca de si cambió: así el diff es una `Table`
  // normal en vez de un <table> a mano.
  const diffRows = keys.map((k) => ({
    field: k,
    old: old?.[k],
    next: next?.[k],
    changed: JSON.stringify(old?.[k]) !== JSON.stringify(next?.[k]),
  }));

  const renderValue = (v: any) =>
    v === null || v === undefined ? (
      <span className="opacity-30 italic">null</span>
    ) : (
      String(v).slice(0, 80)
    );

  const diffColumns: TableColumn<(typeof diffRows)[number]>[] = [
    { header: 'Campo', accessor: 'field', width: '33%', className: 'font-medium' },
    {
      header: 'Anterior',
      width: '33%',
      cell: (r) => (
        <span className={`font-mono text-xs ${r.changed ? 'text-danger-fg' : 'text-fg-muted'}`}>
          {renderValue(r.old)}
        </span>
      ),
    },
    {
      header: 'Nuevo',
      width: '33%',
      cell: (r) => (
        <span
          className={`font-mono text-xs ${r.changed ? 'text-success-fg font-semibold' : 'text-fg-muted'}`}
        >
          {renderValue(r.next)}
        </span>
      ),
    },
  ];

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
        <Table
          columns={diffColumns}
          data={diffRows}
          rowKey={(r) => r.field}
          density="compact"
          emptyMessage="Sin campos comparables"
        />
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

  const columns: TableColumn<AuditLog>[] = [
    {
      header: 'Fecha / Hora',
      cell: (log) => {
        const date = new Date(log.createdAt);
        return (
          <div>
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
          </div>
        );
      },
    },
    {
      header: 'Acción',
      cell: (log) => {
        const cfg = ACTION_CONFIG[log.action] || ACTION_CONFIG.CREATE;
        return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
      },
    },
    {
      header: 'Entidad',
      cell: (log) => <span className="font-bold text-fg-body text-sm">{log.entityType}</span>,
    },
    {
      header: 'ID Entidad',
      cell: (log) => (
        <span className="font-mono text-xs text-fg-muted bg-bg-muted px-2 py-1 rounded-lg">
          {log.entityId.slice(0, 12)}…
        </span>
      ),
    },
    {
      header: 'Usuario',
      cell: (log) =>
        log.userId ? (
          <span className="text-xs text-fg-muted font-medium">{log.userId.slice(0, 12)}…</span>
        ) : (
          <span className="text-xs text-fg-muted font-medium opacity-40 italic">sistema</span>
        ),
    },
  ];

  // El ojo de "ver detalle" pasa al menú ⋯ de la fila; se deshabilita cuando el
  // registro no guarda ni valor anterior ni nuevo, igual que antes se ocultaba.
  const rowActions = (log: AuditLog): RowAction[] => [
    {
      label: 'Ver detalle',
      icon: <Eye size={14} />,
      disabled: !(log.oldValue || log.newValue),
      onClick: () => setSelectedLog(log),
    },
  ];

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
      {!loading && logs.length === 0 ? (
        <Card className="border-0">
          <EmptyState
            icon={<ClipboardList size={32} />}
            title="No se encontraron registros de auditoría"
            hint="Prueba a ampliar el rango de fechas o a quitar filtros."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden border-0" noPadding>
          {/* La Table trae cabecera, esqueleto de carga y paginación; la de
              servidor se le pasa con `total` porque `logs` es solo la página. */}
          <Table
            columns={columns}
            data={logs}
            isLoading={loading}
            rowActions={rowActions}
            onRowClick={(log) => (log.oldValue || log.newValue) && setSelectedLog(log)}
            skeletonRows={8}
            skeletonRowHeight={28}
            pagination={{
              page,
              pageSize: limit,
              total,
              onPageChange: (p) => setPage(Math.min(totalPages, Math.max(1, p))),
              pageSizeOptions: [],
            }}
          />
        </Card>
      )}
    </div>
  );
};
