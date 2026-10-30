import { coreApi } from '@/shared/api';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Card, Table, Button, Loader, PageHeader, useToast, usePopup, Badge } from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { Plus, Trash2, Eye, Table as TableIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTabs } from '@/context/TabsContext';
import { useFormat } from '@/hooks/useFormat';
import { usePluginFields, PluginFieldValue } from '@/components/plugin-fields';
import { useI18n } from '@/i18n/I18nContext';

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
  const popup = usePopup();
  const { t } = useI18n();

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
        header: meta.label || t('userTables.list.record'),
        accessor: (r: any) => (
          <span className="font-semibold text-fg-default">
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
      header: t('userTables.list.created'),
      align: 'right' as const,
      accessor: (r: any) => fmt.date(r.createdAt),
    });
    return cols;
  }, [meta, fmt, t]);

  const removeRow = async (r: any) => {
    const ok = await popup.confirm({
      title: t('userTables.list.deleteTitle'),
      message: t('userTables.list.deleteMessage'),
      tone: 'danger',
      confirmLabel: t('userTables.list.delete'),
    });
    if (!ok) return;
    const res = await coreApi.raw('DELETE', `/api/user-tables/${tblName}/rows/${r.id}`);
    if (res.ok) {
      toast.success(t('userTables.list.deleted'));
      load();
    } else toast.error(t('userTables.list.deleteError'));
  };

  const allColumns = [...baseCols, ...pluginCols];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que ya no hace falta una
  // columna extra con el botón de borrar.
  const rowActions = (r: any): RowAction[] => [
    {
      label: t('userTables.list.viewEdit'),
      icon: <Eye size={14} />,
      onClick: () => openTab(`/u/${name}/${r.id}`),
    },
    {
      label: t('userTables.list.delete'),
      icon: <Trash2 size={14} />,
      destructive: true,
      onClick: () => removeRow(r),
      separatorBefore: true,
    },
  ];

  return (
    <div className="p-4 space-y-4 animate-in fade-in duration-300">
      <PageHeader
        title={
          <>
            {meta?.label || name}
            {/* El Badge va con el título y no en `subtitle`: PageHeader pinta el
                subtítulo dentro de un <p> y Badge es un <div>, que el navegador
                cerraría en falso rompiendo la línea. */}
            <Badge variant={meta?.kind === 'document' ? 'info' : 'neutral'}>
              {meta?.kind === 'document'
                ? t('userTables.list.kindDocument')
                : t('userTables.list.kindMaster')}
            </Badge>
          </>
        }
        subtitle={meta?.description || undefined}
        icon={<TableIcon size={18} />}
        size="sm"
        divider
        className="pb-4"
        actions={
          <Button
            type="button"
            onClick={() => openTab(`/u/${name}/new`)}
            className="flex items-center gap-2"
          >
            <Plus size={14} /> {t('userTables.list.new')}
          </Button>
        }
      />

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader />
        </div>
      ) : (
        <Card noPadding>
          <Table
            className="max-md:p-3"
            columns={allColumns}
            data={rows}
            rowActions={rowActions}
            onRowClick={(r: any) => openTab(`/u/${name}/${r.id}`)}
          />
        </Card>
      )}
    </div>
  );
};

export default UserTableList;
