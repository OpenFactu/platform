import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Table, Card, Button, useToast, Badge, SearchInput, PageHeader } from '@openfactu/ui';
import type { RowAction } from '@openfactu/ui';
import { Users, Plus, Edit2 } from 'lucide-react';
import { usePluginListColumns } from '@/components/plugin-fields';
import { partnersApi, partnerGroupsApi } from '../api';
import type { Partner, PartnerGroup } from '../domain/partner';

/**
 * Listado de interlocutores. El alta y la edición van en su propia página
 * (/partners/new y /partners/:id, ver PartnerDetail): en un modal con
 * pestañas la ficha no cabía.
 */
export const Partners: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canWrite =
    user?.role === 'SUPERUSER' || user?.role === 'ADMIN' || user?.permissions?.['/partners']?.write;
  const toast = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [groups, setGroups] = useState<PartnerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user?.tenantId) return;
    let cancelled = false;
    partnersApi
      .list()
      .then((data) => !cancelled && setPartners(data))
      .catch(() => toast.error('Error al cargar interlocutores'))
      .finally(() => !cancelled && setLoading(false));
    partnerGroupsApi
      .list()
      .then((d) => !cancelled && setGroups(Array.isArray(d) ? d : []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  const openDetail = (p: Partner) => navigate(`/partners/${p.id}`);

  const columns = [
    {
      header: 'Código',
      card: 'status' as const,
      sortable: true,
      sortAccessor: (i: Partner) => i.code ?? '',
      cell: (p: Partner) => (
        <Badge variant="neutral" className="font-mono">
          {p.code}
        </Badge>
      ),
    },
    {
      header: 'Razón Social',
      card: 'title' as const,
      cell: (p: Partner) => (
        <span className="font-bold">
          {p.name}
          {p.foreignName && (
            <span className="text-fg-subtle font-normal text-xs ml-1">({p.foreignName})</span>
          )}
        </span>
      ),
    },
    { header: 'NIF/VAT', card: 'subtitle' as const, cell: (p: Partner) => p.nif },
    {
      header: 'Grupo',
      card: 'meta' as const,
      sortable: true,
      sortAccessor: (i: Partner) => i.groupName ?? '',
      cell: (p: Partner) => groups.find((g) => g.id === p.groupId)?.name || '-',
    },
    { header: 'Contacto', card: 'body' as const, cell: (p: Partner) => p.email || p.phone || '-' },
    {
      header: 'Direcciones',
      card: 'hidden' as const,
      cell: (p: Partner) => <Badge variant="info">{p.addresses?.length || 0}</Badge>,
    },
  ];

  const pluginCols = usePluginListColumns('BusinessPartner');
  const allColumns = [...columns, ...pluginCols];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que el permiso de escritura se
  // declara una vez en lugar de duplicarse entre una columna de botones y el menú.
  const rowActions = (p: Partner): RowAction[] => [
    {
      label: 'Editar',
      icon: <Edit2 size={14} />,
      disabled: !canWrite,
      onClick: () => openDetail(p),
    },
  ];

  /**
   * Filtro en cliente: el listado viene entero del servidor, así que basta con
   * cribarlo aquí. Busca por todas las columnas visibles a la vez — código,
   * razón social (y su nombre extranjero), NIF, grupo y contacto — porque el
   * usuario no tiene por qué saber en cuál de ellas está lo que recuerda.
   */
  const visiblePartners = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return partners;
    const groupName = (p: Partner) => groups.find((g) => g.id === p.groupId)?.name || '';
    return partners.filter((p: Partner) =>
      [p.code, p.name, p.foreignName, p.nif, p.email, p.phone, groupName(p)]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [partners, groups, search]);

  return (
    <div className="p-4 space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Interlocutores"
        subtitle="Gestión centralizada de Clientes y Proveedores."
        icon={<Users size={18} />}
        size="lg"
        actions={
          <Button
            type="button"
            onClick={() => navigate('/partners/new')}
            disabled={!canWrite}
            className="flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:grayscale transition-all"
          >
            <Plus size={18} /> Nuevo Interlocutor
          </Button>
        }
      />

      <Card className="overflow-hidden" noPadding>
        <div className="p-3 border-b border-border-subtle">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, razón social, NIF, grupo o contacto…"
            clearable
            containerClassName="max-w-md"
          />
        </div>
        <Table
          columns={allColumns}
          data={visiblePartners}
          className="max-md:p-3"
          isLoading={loading}
          rowActions={rowActions}
          onRowClick={openDetail}
          emptyMessage={
            search ? `Ningún interlocutor coincide con “${search}”.` : 'Aún no hay interlocutores.'
          }
        />
      </Card>
    </div>
  );
};
