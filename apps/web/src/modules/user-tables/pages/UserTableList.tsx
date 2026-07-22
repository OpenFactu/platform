import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Button, Loader, useToast, Badge } from '@openfactu/ui';
import { Plus, Trash2, Eye, Table as TableIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { usePluginFields, PluginFieldValue } from '@/components/plugin-fields';
import { ContextMenu } from '@/components/common/ContextMenu';
import { withRowContextMenu } from '@/components/common/withRowContextMenu';
import { useContextMenu } from '@/hooks/useContextMenu';

interface TableMeta {
  tableName: string;
  label: string | null;
  kind: string;
  iconName: string | null;
  displayField: string | null;
  description: string | null;
}

export const UserTableList: React.FC = () => {
  const { name } = useParams();
  const { token, user } = useAuth();
  const { openTab } = useTabs();
  const fmt = useFormat();
  const toast = useToast();

  const [meta, setMeta] = useState<TableMeta | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const tblName = name?.startsWith('pt_') ? name : `pt_${name}`;

  const load = async () => {
    if (!name || !user?.tenantId) return;
    setLoading(true);
    try {
      const [mRes, rRes] = await Promise.all([
        coreApi.raw('GET', '/api/user-tables'),
        coreApi.raw('GET', `/api/user-tables/${tblName}/rows`),
      ]);
      const tables = mRes.data;
      const m = (Array.isArray(tables) ? tables : []).find((t: any) => t.tableName === tblName);
      setMeta(m || null);
      setRows(rRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, user?.tenantId]);

  // Para tablas de usuario NO filtramos por surface — en una tabla propia,
  // el listado es la vista principal, todos los campos deben aparecer por
  // defecto. Si el admin marca explícitamente algunos como `showInList`,
  // priorizamos ese subconjunto; si no, mostramos todos.
  const allFields = usePluginFields(tblName);
  const fieldsToShow = useMemo(() => {
    const flagged = allFields.filter((f) => f.showInList);
    return flagged.length > 0 ? flagged : allFields;
  }, [allFields]);
  const pluginCols = useMemo(
    () =>
      fieldsToShow.map((f) => ({
        header: f.label,
        sortable:
          f.fieldType === 'TEXT' ||
          f.fieldType === 'INTEGER' ||
          f.fieldType === 'DECIMAL' ||
          f.fieldType === 'CURRENCY' ||
          f.fieldType === 'PERCENT' ||
          f.fieldType === 'DATE' ||
          f.fieldType === 'ENUM',
        sortAccessor: (item: any) => item?.[f.fieldName] ?? '',
        cell: (item: any) => (
          <div className="truncate" style={{ maxWidth: '200px' }}>
            <PluginFieldValue def={f as any} value={item?.[f.fieldName]} fmt={fmt as any} />
          </div>
        ),
      })),
    [fieldsToShow, fmt],
  );

  const baseCols = useMemo(() => {
    const cols: any[] = [];
    if (meta?.displayField) {
      cols.push({
        header: meta.label || 'Registro',
        accessor: (r: any) => (
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {r[meta.displayField as string] ?? '—'}
          </span>
        ),
      });
    } else {
      cols.push({
        header: 'ID',
        accessor: (r: any) => (
          <code className="font-mono text-[11px] text-slate-500">{r.id.slice(0, 8)}…</code>
        ),
      });
    }
    cols.push({
      header: 'Creado',
      align: 'right' as const,
      accessor: (r: any) => fmt.date(r.createdAt),
    });
    return cols;
  }, [meta, fmt]);

  const removeRow = async (r: any) => {
    if (!confirm('¿Eliminar este registro?')) return;
    const res = await coreApi.raw('DELETE', `/api/user-tables/${tblName}/rows/${r.id}`);
    if (res.ok) {
      toast.success('Eliminado');
      load();
    } else toast.error('Error al eliminar');
  };

  const actionCol = {
    header: '',
    align: 'right' as const,
    width: '60px',
    cell: (r: any) => (
      <button
        onClick={(e) => {
          e.stopPropagation();
          removeRow(r);
        }}
        className="p-1.5 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded"
        title="Eliminar"
      >
        <Trash2 size={13} />
      </button>
    ),
  };

  const allColumns = [...baseCols, ...pluginCols, actionCol];
  const ctxMenu = useContextMenu<any>();
  const ctxColumns = withRowContextMenu(allColumns, (e, item) => ctxMenu.open(e, item));
  const buildCtxItems = (r: any) => [
    { label: 'Ver / Editar', icon: <Eye size={14} />, onClick: () => openTab(`/u/${name}/${r.id}`) },
    {
      label: 'Eliminar',
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => removeRow(r),
      separatorBefore: true,
    },
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <header className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <TableIcon className="text-blue-600 dark:text-blue-300" size={22} />
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {meta?.label || name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Badge variant={meta?.kind === 'document' ? 'info' : 'neutral'}>
                {meta?.kind === 'document' ? 'Documento' : 'Maestro'}
              </Badge>
              {meta?.description && <span>{meta.description}</span>}
            </div>
          </div>
        </div>
        <Button onClick={() => openTab(`/u/${name}/new`)} className="flex items-center gap-2">
          <Plus size={14} /> Nuevo
        </Button>
      </header>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : (
        <Card noPadding>
          <Table
            columns={ctxColumns}
            data={rows}
            onRowClick={(r: any) => openTab(`/u/${name}/${r.id}`)}
          />
        </Card>
      )}
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

export default UserTableList;
